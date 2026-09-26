import type { ComponentType } from 'react';
import type { AckResult, RoomDetail, SeatInfo } from '@goc/shared';

export interface TableProps<View> {
  view: View;
  /** Your engine player id, or null when spectating. */
  you: string | null;
  actors: string[];
  deadlines: Record<string, number>;
  seats: SeatInfo[];
  room: RoomDetail;
  act(action: unknown): Promise<AckResult>;
}

export interface ConfigField {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  hint?: string;
}

export interface ClientGame {
  /** Renders the game's redacted view and sends intents. */
  Table: ComponentType<TableProps<any>>;
  tagline: string;
  /** Short rules shown in the lobby and waiting room. */
  rules: string[];
  /** Editable config values when creating a table (keys of the engine config). */
  configFields: ConfigField[];
  /** Cards shown on the lobby tile. */
  showcase: string[];
  /** Does this game use chips? */
  chips: boolean;
}
