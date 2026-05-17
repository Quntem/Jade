import { Terminal, useTerminal } from "@wterm/react";
import { BashShell } from "@wterm/just-bash";
import { useCallback, useRef } from "react";
import { defineCommand } from "just-bash";
import "@wterm/react/css";

type ShellSize = {
  cols: number;
  rows: number;
};

type NanoSession = {
  path: string;
  content: string;
  savedContent: string;
  cursor: number;
  topLine: number;
  horizontalOffset: number;
  status: string;
  prompt: "save" | null;
  resolve: (result: { stdout: string; stderr: string; exitCode: number }) => void;
};

function resolveShellPath(path: string, cwd: string) {
  const rawPath = path.trim() || "untitled.txt";
  const expandedPath = rawPath === "~" || rawPath.startsWith("~/")
    ? `/home/user${rawPath.slice(1)}`
    : rawPath;
  const absolutePath = expandedPath.startsWith("/")
    ? expandedPath
    : `${cwd}/${expandedPath}`;

  const parts: string[] = [];
  for (const part of absolutePath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return `/${parts.join("/")}`;
}

function escapeControl(text: string) {
  return text.replace(/\x1b/g, "").replace(/\r/g, "");
}

function fit(text: string, width: number) {
  const safeText = escapeControl(text);
  if (safeText.length >= width) return safeText.slice(0, width);
  return safeText + " ".repeat(width - safeText.length);
}

function getLines(content: string) {
  return content.split("\n");
}

function getCursorPoint(content: string, cursor: number) {
  const beforeCursor = content.slice(0, cursor);
  const lines = beforeCursor.split("\n");

  return {
    line: lines.length - 1,
    column: lines.at(-1)?.length ?? 0,
  };
}

function getIndexForPoint(lines: string[], targetLine: number, targetColumn: number) {
  const line = Math.max(0, Math.min(targetLine, lines.length - 1));
  let index = 0;

  for (let i = 0; i < line; i += 1) {
    index += lines[i].length + 1;
  }

  return index + Math.min(targetColumn, lines[line].length);
}

function redrawNano(session: NanoSession, size: ShellSize, write: (data: string) => void) {
  const cols = Math.max(size.cols, 20);
  const rows = Math.max(size.rows, 8);
  const editRows = rows - 3;
  const lines = getLines(session.content);
  const cursorPoint = getCursorPoint(session.content, session.cursor);

  if (cursorPoint.line < session.topLine) {
    session.topLine = cursorPoint.line;
  } else if (cursorPoint.line >= session.topLine + editRows) {
    session.topLine = cursorPoint.line - editRows + 1;
  }

  if (cursorPoint.column < session.horizontalOffset) {
    session.horizontalOffset = cursorPoint.column;
  } else if (cursorPoint.column >= session.horizontalOffset + cols) {
    session.horizontalOffset = cursorPoint.column - cols + 1;
  }

  const modifiedMark = session.content === session.savedContent ? "" : " *";
  const title = ` GNU nano  ${session.path}${modifiedMark}`;
  const body = Array.from({ length: editRows }, (_, index) => {
    const line = lines[session.topLine + index] ?? "";
    return fit(line.slice(session.horizontalOffset), cols);
  });
  const status = ` ${session.status || "^X exit"}`;
  const shortcuts = session.prompt === "save"
    ? "Y Yes  N No  Esc Cancel"
    : "^X Exit";

  const cursorRow = cursorPoint.line - session.topLine + 2;
  const cursorCol = cursorPoint.column - session.horizontalOffset + 1;

  write([
    "\x1b[?25l",
    "\x1b[H",
    "\x1b[7m",
    fit(title, cols),
    "\x1b[0m",
    ...body.map((line) => `\r\n${line}`),
    "\r\n\x1b[7m",
    fit(status, cols),
    "\x1b[0m",
    "\r\n",
    fit(shortcuts, cols),
    `\x1b[${cursorRow};${cursorCol}H`,
    "\x1b[?25h",
  ].join(""));
}

function insertText(session: NanoSession, text: string) {
  session.content = `${session.content.slice(0, session.cursor)}${text}${session.content.slice(session.cursor)}`;
  session.cursor += text.length;
  session.prompt = null;
  session.status = "Modified";
}

function moveCursor(session: NanoSession, direction: "left" | "right" | "up" | "down") {
  const lines = getLines(session.content);
  const point = getCursorPoint(session.content, session.cursor);

  if (direction === "left") {
    session.cursor = Math.max(0, session.cursor - 1);
    return;
  }

  if (direction === "right") {
    session.cursor = Math.min(session.content.length, session.cursor + 1);
    return;
  }

  if (direction === "up") {
    session.cursor = getIndexForPoint(lines, point.line - 1, point.column);
    return;
  }

  session.cursor = getIndexForPoint(lines, point.line + 1, point.column);
}

function handleNanoCharacter(session: NanoSession, data: string) {
  if (data === "\x1b[D") moveCursor(session, "left");
  else if (data === "\x1b[C") moveCursor(session, "right");
  else if (data === "\x1b[A") moveCursor(session, "up");
  else if (data === "\x1b[B") moveCursor(session, "down");
  else if (data === "\x7f" || data === "\b") {
    if (session.cursor > 0) {
      session.content = `${session.content.slice(0, session.cursor - 1)}${session.content.slice(session.cursor)}`;
      session.cursor -= 1;
      session.prompt = null;
      session.status = "Modified";
    }
  } else if (data === "\r") {
    insertText(session, "\n");
  } else if (data >= " ") {
    insertText(session, data);
  }
}

export function WebShell() {
  const { ref, write } = useTerminal();
  const shellRef = useRef<BashShell | null>(null);
  const nanoRef = useRef<NanoSession | null>(null);
  const sizeRef = useRef<ShellSize>({ cols: 80, rows: 24 });

  const writeNanoFile = useCallback(async (session: NanoSession) => {
    try {
      await shellRef.current?.bash?.writeFile(session.path, session.content);
      session.savedContent = session.content;
      session.status = `Wrote ${session.content.length} chars`;
      return true;
    } catch (error) {
      session.status = error instanceof Error ? error.message : "Unable to save file";
      return false;
    }
  }, []);

  const closeNano = useCallback((stdout: string) => {
    const session = nanoRef.current;
    if (!session) return;

    write("\x1b[?1049l");
    nanoRef.current = null;
    session.resolve({ stdout, stderr: "", exitCode: 0 });
  }, [write]);

  const saveAndCloseNano = useCallback(async () => {
    const session = nanoRef.current;
    if (!session) return;

    const saved = await writeNanoFile(session);
    if (saved) {
      closeNano(`nano: wrote ${session.path}\r\n`);
      return;
    }

    redrawNano(session, sizeRef.current, write);
  }, [closeNano, write, writeNanoFile]);

  const openNano = useCallback((path: string, content: string) => {
    return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const session: NanoSession = {
        path,
        content,
        savedContent: content,
        cursor: 0,
        topLine: 0,
        horizontalOffset: 0,
        status: content ? `Opened ${path}` : `New file: ${path}`,
        prompt: null,
        resolve,
      };

      nanoRef.current = session;
      write("\x1b[?1049h\x1b[2J\x1b[H");
      redrawNano(session, sizeRef.current, write);
    });
  }, [write]);

  const handleReady = useCallback(async () => {
    if (shellRef.current) return;

    const shell = new BashShell({
      files: { "/home/user/hello.txt": "Hello, world!\n" },
      greeting: [
        "Welcome to wterm!",
        "Try: nano hello.txt",
      ],
    });
    shellRef.current = shell;

    await shell.attach(write);

    shell.bash?.registerCommand(defineCommand("nano", async (args, ctx) => {
      const targetPath = resolveShellPath(args[0] ?? "untitled.txt", ctx.cwd);
      let content = "";

      try {
        content = await ctx.fs.readFile(targetPath);
      } catch {
        content = "";
      }

      return openNano(targetPath, content);
    }));
  }, [openNano, write]);

  const handleNanoInput = useCallback((data: string) => {
    const session = nanoRef.current;
    if (!session) return;

    if (session.prompt === "save") {
      if (data.toLowerCase() === "y") {
        void saveAndCloseNano();
        return;
      }

      if (data.toLowerCase() === "n") {
        closeNano("nano: discarded unsaved changes\r\n");
        return;
      }

      if (data === "\x1b") {
        session.prompt = null;
        session.status = "Cancelled";
        redrawNano(session, sizeRef.current, write);
      }

      return;
    }

    if (data === "\x18") {
      if (session.content !== session.savedContent) {
        session.prompt = "save";
        session.status = "Save modified buffer?";
        redrawNano(session, sizeRef.current, write);
        return;
      }

      closeNano("");
      return;
    }

    if (data.length > 1 && !data.startsWith("\x1b[")) {
      for (const char of data) {
        handleNanoCharacter(session, char);
      }
    } else {
      handleNanoCharacter(session, data);
    }

    redrawNano(session, sizeRef.current, write);
  }, [closeNano, saveAndCloseNano, write]);

  const handleData = useCallback((data: string) => {
    if (nanoRef.current) {
      handleNanoInput(data);
      return;
    }

    shellRef.current?.handleInput(data);
  }, [handleNanoInput]);

  const handleResize = useCallback((cols: number, rows: number) => {
    sizeRef.current = { cols, rows };
    if (nanoRef.current) {
      redrawNano(nanoRef.current, sizeRef.current, write);
    }
  }, [write]);

  return (
    <Terminal
      className="flex flex-1"
      theme="light"
      autoResize
      ref={ref}
      onReady={handleReady}
      onData={handleData}
      onResize={handleResize}
    />
  );
}
