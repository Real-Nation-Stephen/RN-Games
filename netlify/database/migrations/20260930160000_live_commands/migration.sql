-- Keep retry receipts out of the hot room document. Each receipt is written in
-- the same transaction as its answer; room deletion also removes its receipts.
CREATE TABLE IF NOT EXISTS rn_live_commands_v1 (
  code text NOT NULL REFERENCES rn_live_runs_v1(code) ON DELETE CASCADE,
  command_id text NOT NULL,
  participant_id text NOT NULL,
  action text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(code,command_id)
);

CREATE OR REPLACE FUNCTION rn_live_action_v1(room text, op text, pid text, participant_secret text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  r rn_live_runs_v1%ROWTYPE; s jsonb; n jsonb; cfg jsonb; p jsonb;
  recorded rn_live_commands_v1%ROWTYPE;
  answer jsonb; result jsonb; q jsonb; nextq jsonb; event jsonb;
  kind text; step text; attempt text; command text; option_id text; team text;
  choice text; question text; answer_key text; number integer; idx integer;
  delta integer; target integer; previous integer; score integer; ts bigint;
  correct boolean; teams jsonb; a text; b text; ca integer; cb integer;
BEGIN
  SELECT * INTO r FROM rn_live_runs_v1 WHERE code=room FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Run not found','statusCode',404); END IF;
  s:=r.state; n:=s->'node'; kind:=n->>'kind'; attempt:=s->>'roundAttemptId';
  step:=r.snapshot->'steps'->((s->>'currentStepIndex')::integer)->>'id';
  cfg:=r.snapshot->'configs'->step;
  ts:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  p:=s->'participants'->pid;
  IF op='join' THEN
    IF p IS NOT NULL THEN
      IF participant_secret='' OR p->>'secret' IS DISTINCT FROM participant_secret THEN
        RETURN jsonb_build_object('error','Invalid participant','statusCode',403);
      END IF;
    ELSE
      IF coalesce((payload->>'reconnect')::boolean,false) THEN RETURN jsonb_build_object('error','Invalid participant','statusCode',403); END IF;
      IF s->>'status'='superseded' THEN RETURN jsonb_build_object('error','Run ended','statusCode',410); END IF;
      number:=coalesce((s->>'nextParticipantNumber')::integer,1);
      IF kind='fill-game' THEN
        teams:=cfg->'teams';a:=teams->0->>'id';b:=teams->1->>'id';
        SELECT count(*) FILTER (WHERE value->>'teamId'=a), count(*) FILTER (WHERE value->>'teamId'=b)
        INTO ca,cb FROM jsonb_each(s->'participants');
        team:=CASE WHEN b IS NULL OR ca<=cb THEN a ELSE b END;
      END IF;
      p:=jsonb_build_object('id',pid,'secret',participant_secret,'number',number,'teamId',team,'joinedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
      s:=jsonb_set(s,'{nextParticipantNumber}',to_jsonb(number+1));
    END IF;
    result:=jsonb_build_object('participant',p);
  ELSE
    IF p IS NULL OR participant_secret='' OR p->>'secret' IS DISTINCT FROM participant_secret THEN RETURN jsonb_build_object('error','Forbidden','statusCode',403); END IF;
    command:=payload->>'commandId';
    IF coalesce(command,'')<>'' THEN
      SELECT * INTO recorded FROM rn_live_commands_v1 WHERE code=room AND command_id=command;
      IF FOUND THEN
        IF recorded.participant_id<>pid OR recorded.action<>op THEN RETURN jsonb_build_object('error','Command belongs to another action','statusCode',409); END IF;
        RETURN jsonb_build_object('run',s||jsonb_build_object('snapshot',r.snapshot),'result',recorded.result||jsonb_build_object('duplicate',true,'commandId',command));
      END IF;
    END IF;
    IF command IS NOT NULL AND s->'commandLog'->command IS NOT NULL THEN
      RETURN jsonb_build_object('run',s||jsonb_build_object('snapshot',r.snapshot),'result',coalesce(s->'commandLog'->command->'result','{}')||jsonb_build_object('duplicate',true,'commandId',command));
    END IF;
    IF coalesce(payload->>'runId','')<>'' AND payload->>'runId' IS DISTINCT FROM s->>'runId' THEN RETURN jsonb_build_object('error','Stale run','statusCode',409,'code','stale_run'); END IF;
    IF coalesce(payload->>'nodeId','')='' OR payload->>'nodeId' IS DISTINCT FROM step THEN RETURN jsonb_build_object('error','Stale node','statusCode',409,'code','stale_node'); END IF;
    IF coalesce(payload->>'roundAttemptId','')='' OR payload->>'roundAttemptId' IS DISTINCT FROM attempt THEN RETURN jsonb_build_object('error','Stale round','statusCode',409,'code','stale_round'); END IF;
    IF coalesce((s->>'held')::boolean,false) THEN RETURN jsonb_build_object('error','Run is on hold','statusCode',423,'code','held'); END IF;
    IF kind='mini-poll' AND op='vote' THEN
      IF n->>'phase'<>'open' THEN RETURN jsonb_build_object('error','Voting closed','statusCode',423); END IF;
      IF n->'votes'->pid IS NOT NULL THEN RETURN jsonb_build_object('error','Already voted','statusCode',409,'code','already_voted'); END IF;
      option_id:=payload->>'optionId';
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'options') o WHERE o->>'id'=option_id) THEN RETURN jsonb_build_object('error','Invalid option','statusCode',400); END IF;
      n:=jsonb_set(n,ARRAY['votes',pid],to_jsonb(option_id)); result:=jsonb_build_object('optionId',option_id);
    ELSIF kind='fill-game' AND op='answer' THEN
      IF n->>'phase'='countdown' AND ts>=(n->>'startsAt')::bigint THEN n:=jsonb_set(n,'{phase}','"racing"'); END IF;
      IF n->>'phase'<>'racing' OR n->>'finishedTeamId' IS NOT NULL OR ts>=(n->>'endsAt')::bigint THEN RETURN jsonb_build_object('error','Race is not open','statusCode',423); END IF;
      question:=payload->>'questionId';idx:=coalesce((n->'cursors'->>pid)::integer,0);q:=cfg->'questions'->idx;
      IF coalesce(question,'')='' THEN RETURN jsonb_build_object('error','questionId required','statusCode',400,'code','missing_question'); END IF;
      IF q IS NULL THEN RETURN jsonb_build_object('error','Question bank finished','statusCode',409,'code','bank_finished'); END IF;
      IF q->>'id' IS DISTINCT FROM question THEN RETURN jsonb_build_object('error','Stale question','statusCode',409,'code','stale_question'); END IF;
      answer_key:=pid||':'||question||':'||attempt;
      IF n->'answered'->answer_key IS NOT NULL THEN RETURN jsonb_build_object('error','Already answered','statusCode',409,'code','already_answered'); END IF;
      choice:=payload->>'choiceId';
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'choices') c WHERE c->>'id'=choice) THEN RETURN jsonb_build_object('error','Invalid choice','statusCode',400); END IF;
      team:=p->>'teamId';
      IF team IS NULL THEN RETURN jsonb_build_object('error','Team assignment missing','statusCode',409); END IF;
      correct:=choice=q->>'correctChoiceId';delta:=CASE WHEN correct THEN 1 ELSE -1 END;
      SELECT coalesce((n->>'target')::integer,(t->>'target')::integer,8) INTO target FROM jsonb_array_elements(cfg->'teams') t WHERE t->>'id'=team;
      target:=least(999,greatest(1,target));previous:=coalesce((n->'scores'->>team)::integer,0);score:=greatest(0,least(target,previous+delta));
      event:=jsonb_build_object('id',payload->>'eventId','teamId',team,'participantNumber',p->'number','delta',delta,'clamped',score<>previous+delta,'at',ts);
      n:=jsonb_set(n,ARRAY['scores',team],to_jsonb(score));
      n:=jsonb_set(n,ARRAY['answered',answer_key],to_jsonb(choice));
      n:=jsonb_set(n,ARRAY['cursors',pid],to_jsonb(idx+1));
      n:=jsonb_set(n,'{lastFeedback}',coalesce(n->'lastFeedback','{}'));
      n:=jsonb_set(n,ARRAY['lastFeedback',pid],jsonb_build_object('correct',correct,'delta',delta,'questionId',question));
      SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO answer FROM jsonb_array_elements(coalesce(n->'events','[]')||jsonb_build_array(event)) WITH ORDINALITY e(value,ord) WHERE ord>jsonb_array_length(coalesce(n->'events','[]'))+1-80;
      n:=jsonb_set(n,'{events}',answer);
      IF score>=target THEN n:=n||jsonb_build_object('finishedTeamId',team,'finishReason','target','finishedAt',ts,'tied',false,'phase','finished'); END IF;
      nextq:=cfg->'questions'->(idx+1);
      result:=jsonb_build_object('correct',correct,'delta',delta,'eventId',event->>'id','waiting',nextq IS NULL,'nextQuestion',CASE WHEN nextq IS NULL THEN NULL ELSE nextq-'correctChoiceId' END);
    ELSIF kind='pinboard' AND op='submit' THEN
      IF coalesce(payload->>'kind','note')<>'photo' AND btrim(coalesce(payload->>'text',''))='' THEN RETURN jsonb_build_object('error','Note required','statusCode',400); END IF;
      answer:=jsonb_build_object('id',payload->>'eventId','participantId',pid,'participantNumber',p->'number','kind',CASE WHEN payload->>'kind'='photo' THEN 'photo' ELSE 'note' END,'text',left(coalesce(payload->>'text',''),280),'mediaId',payload->>'mediaId','status','pending','createdAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
      n:=jsonb_set(n,'{submissions}',coalesce(n->'submissions','[]')||jsonb_build_array(answer));result:=jsonb_build_object('submissionId',answer->>'id','status','pending');
    ELSE RETURN jsonb_build_object('error','Unsupported fast action','statusCode',400); END IF;
    s:=jsonb_set(s,'{node}',n);
    IF coalesce(command,'')<>'' THEN
      INSERT INTO rn_live_commands_v1(code,command_id,participant_id,action,result) VALUES(room,command,pid,op,result);
    END IF;
  END IF;
  p:=p||jsonb_build_object('lastSeen',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  s:=jsonb_set(s,ARRAY['participants',pid],p);
  s:=s||jsonb_build_object('revision',r.revision+1,'updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  UPDATE rn_live_runs_v1 SET state=s,revision=r.revision+1,updated_at=clock_timestamp() WHERE code=room;
  INSERT INTO rn_live_presence_v1(code,participant_id,last_seen) VALUES(room,pid,clock_timestamp()) ON CONFLICT(code,participant_id) DO UPDATE SET last_seen=EXCLUDED.last_seen;
  RETURN jsonb_build_object('run',s||jsonb_build_object('snapshot',r.snapshot),'result',result);
END $$;
