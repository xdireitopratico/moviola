import { createSession, type ActivityEvent, type Launch, type Scene, type Session } from "./contract.ts";

export { createSession };

export function record(sessionId: string, at: string, operation: string, detail: string): ActivityEvent {
  return { id: crypto.randomUUID(), sessionId, at, operation, detail };
}

interface Beat {
  title: string;
  narration: string;
  prompt: string;
}

function beats(theme: string): Beat[] {
  const name = theme.trim() || "Sem título";
  return [
    {
      title: "Abertura",
      narration: `${name}. O primeiro plano apresenta o tema.`,
      prompt: `abertura cinematográfica sobre ${name}`,
    },
    {
      title: "Desenvolvimento",
      narration: `O meio de ${name} mostra o que muda.`,
      prompt: `plano médio sobre ${name}`,
    },
    {
      title: "Virada",
      narration: `A virada de ${name} fica explícita.`,
      prompt: `close da virada de ${name}`,
    },
    {
      title: "Fecho",
      narration: `${name} termina numa imagem que permanece.`,
      prompt: `plano final de ${name}`,
    },
  ];
}

function draft(beat: Beat, index: number, durationSeconds: number, id: string): Scene {
  return {
    id,
    index,
    title: beat.title,
    narration: beat.narration,
    prompt: beat.prompt,
    durationSeconds,
    status: "vazia",
    filePath: null,
  };
}

export function fillStoryboard(session: Session, now: string): Session {
  const duration = Math.max(4, Math.round(session.launch.durationSeconds / 4));
  const scenes = beats(session.launch.theme).map((beat, index) => {
    const current = session.scenes.find((scene) => scene.index === index);
    if (current?.status === "travada") return { ...current, index };
    return draft(beat, index, duration, current?.id ?? crypto.randomUUID());
  });
  return { ...session, scenes, updatedAt: now };
}

export function openSession(launch: Launch, now: string): { session: Session; event: ActivityEvent } {
  const session = createSession(launch, now);
  const event = record(session.id, now, "createSession", session.projectName);
  return { session: { ...session, lastEvent: event }, event };
}

export function storyboard(session: Session, now: string): { session: Session; event: ActivityEvent } {
  const next = fillStoryboard(session, now);
  const event = record(session.id, now, "fillStoryboard", `${next.scenes.length} cenas`);
  return { session: { ...next, lastEvent: event }, event };
}
