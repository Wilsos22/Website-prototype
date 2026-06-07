// Tiny file-backed question store for the prototype API routes. It persists local sessions without a database.
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export interface StudentResponse {
  id: string;
  name: string;
  answer: string;
  submittedAt: string;
}

export interface QuestionSession {
  code: string;
  question: string;
  createdAt: string;
  responses: StudentResponse[];
}

interface QuestionStoreData {
  sessions: QuestionSession[];
}

const globalStore = globalThis as typeof globalThis & {
  bigDogBoardSessions?: Map<string, QuestionSession>;
  bigDogBoardSessionsLoaded?: boolean;
  bigDogBoardWriteQueue?: Promise<void>;
};

const sessions = globalStore.bigDogBoardSessions ?? new Map<string, QuestionSession>();
globalStore.bigDogBoardSessions = sessions;

const dataDirectory = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDirectory, "question-sessions.json");

async function loadSessions(): Promise<void> {
  if (globalStore.bigDogBoardSessionsLoaded) {
    return;
  }

  try {
    const fileContents = await readFile(dataFile, "utf8");
    const data = JSON.parse(fileContents) as QuestionStoreData;
    sessions.clear();

    for (const session of data.sessions ?? []) {
      sessions.set(session.code, session);
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      console.warn("Big Dog Board could not load question history.", error);
    }
  }

  globalStore.bigDogBoardSessionsLoaded = true;
}

async function persistSessions(): Promise<void> {
  const previousWrite = globalStore.bigDogBoardWriteQueue ?? Promise.resolve();

  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      const data: QuestionStoreData = {
        sessions: Array.from(sessions.values()).sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        ),
      };
      await writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");
    });

  globalStore.bigDogBoardWriteQueue = nextWrite;
  await nextWrite;
}

function generateCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function createQuestionSession(question: string): Promise<QuestionSession> {
  await loadSessions();
  let code = generateCode();

  while (sessions.has(code)) {
    code = generateCode();
  }

  const session: QuestionSession = {
    code,
    question,
    createdAt: new Date().toISOString(),
    responses: [],
  };

  sessions.set(code, session);
  await persistSessions();
  return session;
}

export async function getQuestionSession(code: string): Promise<QuestionSession | undefined> {
  await loadSessions();
  return sessions.get(code);
}

export async function listQuestionSessions(): Promise<QuestionSession[]> {
  await loadSessions();

  return Array.from(sessions.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function addStudentResponse(
  code: string,
  name: string,
  answer: string,
): Promise<StudentResponse> {
  await loadSessions();
  const session = sessions.get(code);

  if (!session) {
    throw new Error("Session not found");
  }

  const response: StudentResponse = {
    id: crypto.randomUUID(),
    name,
    answer,
    submittedAt: new Date().toISOString(),
  };

  session.responses.push(response);
  await persistSessions();
  return response;
}
