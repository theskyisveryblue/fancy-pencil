import type { Command } from './commands';
import type { PenDocument } from './types';

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}

export class History {
  private past: Command[] = [];
  private future: Command[] = [];
  private current: PenDocument;

  constructor(document: PenDocument) {
    this.current = document;
  }

  get document(): PenDocument {
    return this.current;
  }

  get state(): HistoryState {
    return {
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      undoDepth: this.past.length,
      redoDepth: this.future.length,
    };
  }

  execute(command: Command): PenDocument {
    this.current = command.apply(this.current);
    this.past.push(command);
    this.future = [];
    return this.current;
  }

  undo(): PenDocument {
    const command = this.past.pop();
    if (!command) return this.current;
    this.current = command.invert().apply(this.current);
    this.future.push(command);
    return this.current;
  }

  redo(): PenDocument {
    const command = this.future.pop();
    if (!command) return this.current;
    this.current = command.apply(this.current);
    this.past.push(command);
    return this.current;
  }

  reset(document: PenDocument): void {
    this.current = document;
    this.past = [];
    this.future = [];
  }
}
