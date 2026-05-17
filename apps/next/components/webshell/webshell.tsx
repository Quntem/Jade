import { Terminal } from "@wterm/react";
import { IDockviewPanelProps } from "dockview-react";
import { useCallback, useRef } from "react";
import { useTerminal } from "@wterm/react";
import { BashShell } from "@wterm/just-bash";
import "@wterm/react/css";

export function WebShell(params: IDockviewPanelProps) {
    const { ref, write } = useTerminal();
  const shellRef = useRef<BashShell | null>(null);

  const handleReady = useCallback(() => {
    if (shellRef.current) return;
    const shell = new BashShell({
      files: { "/home/user/hello.txt": "Hello, world!\n" },
      greeting: "Welcome to wterm!",
    });
    shellRef.current = shell;
    shell.attach(write);
  }, [write]);

  const handleData = useCallback((data: string) => {
    shellRef.current?.handleInput(data);
  }, []);

  return (
    <Terminal
    className="flex flex-1"
      theme="light"  
      autoResize
      ref={ref}
    //   onResize={(cols, rows) => {
    //     ref.current?.resize(cols, rows);
    //   }}
      onReady={handleReady}
      onData={handleData}
    />
  );
}