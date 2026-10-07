import { createSession, defaultScene, type ActivityEvent, type Launch, type Scene, type Session } from "./contract.ts";
import { runQueue } from "./generate.ts";

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
  return defaultScene({
    id,
    index,
    title: beat.title,
    narration: beat.narration,
    prompt: beat.prompt,
    durationSeconds,
  });
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

export function regenerateScene(session: Session, sceneId: string, now: string): { session: Session; event: ActivityEvent } {
  const scenes = session.scenes.map((scene) =>
    scene.id === sceneId ? { ...scene, status: "gerando" as const, filePath: null } : scene,
  );
  const event = record(session.id, now, "regenerateScene", sceneId);
  return { session: { ...session, scenes, updatedAt: now, lastEvent: event }, event };
}

export function storyboard(session: Session, now: string): { session: Session; event: ActivityEvent } {
  const next = fillStoryboard(session, now);
  const event = record(session.id, now, "fillStoryboard", `${next.scenes.length} cenas`);
  return { session: { ...next, lastEvent: event }, event };
}

export async function regenerateThroughQueue(
  session: Session,
  sceneId: string,
  step: (scene: Scene) => Promise<Scene>,
  now: string,
): Promise<{ session: Session; event: ActivityEvent }> {
  const marked = regenerateScene(session, sceneId, now);
  const target = marked.session.scenes.find((scene) => scene.id === sceneId);
  if (!target) throw new Error(`cena ausente: ${sceneId}`);
  const finished = await runQueue([target], step);
  const done = finished[0];
  if (!done) throw new Error("fila vazia");
  const scenes = marked.session.scenes.map((scene) => (scene.id === sceneId ? done : scene));
  return {
    session: { ...marked.session, scenes, updatedAt: now, lastEvent: marked.event },
    event: marked.event,
  };
}

export function splitScene(
  session: Session,
  sceneId: string,
  atSeconds: number,
  now: string,
): Session {
  const target = session.scenes.find((scene) => scene.id === sceneId);
  if (!target) throw new Error(`cena ausente: ${sceneId}`);
  if (atSeconds <= 0 || atSeconds >= target.durationSeconds) {
    throw new Error("corte inválido");
  }
  const left = defaultScene({
    ...target,
    id: crypto.randomUUID(),
    durationSeconds: atSeconds,
  });
  const right = defaultScene({
    ...target,
    id: crypto.randomUUID(),
    durationSeconds: target.durationSeconds - atSeconds,
    filePath: null,
    status: target.filePath ? "vazia" : target.status,
  });
  const without = session.scenes.filter((scene) => scene.id !== sceneId);
  const insertAt = target.index;
  const scenes = [...without, left, right]
    .sort((a, b) => a.index - b.index)
    .map((scene, index) => {
      if (scene.id === left.id) return { ...left, index: insertAt };
      if (scene.id === right.id) return { ...right, index: insertAt + 1 };
      return { ...scene, index: scene.index >= insertAt ? scene.index + 1 : scene.index };
    })
    .sort((a, b) => a.index - b.index)
    .map((scene, index) => ({ ...scene, index }));
  const event = record(session.id, now, "splitScene", sceneId);
  return { ...session, scenes, updatedAt: now, lastEvent: event };
}
