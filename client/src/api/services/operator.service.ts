import { axiosClient } from '../axiosClient';
import type { ApiEnvelope } from '@/types/api';
import type { Operator, OperatorStation, ShiftRosterSlot, Shift } from '@/types/models';

const ROOT = '/operators';

/**
 * Who runs the lines, and who ran them on a given shift.
 *
 * Two questions and two shapes: `list` is the plant's roll of operators, and
 * `roster` is who was on which line for one shift. The roll is the office's to
 * keep and the roster is the supervisor's to fill in.
 */
export const operatorService = {
  /** The seven lines somebody is put on. A fixed list, not a table. */
  async stations(): Promise<OperatorStation[]> {
    const res = await axiosClient.get<ApiEnvelope<OperatorStation[]>>(`${ROOT}/stations`);
    return res.data.data;
  },

  async list(includeInactive = false): Promise<Operator[]> {
    const res = await axiosClient.get<ApiEnvelope<Operator[]>>(ROOT, {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
    });
    return res.data.data;
  },

  async create(payload: { name: string; station?: string | null; note?: string | null }) {
    const res = await axiosClient.post<ApiEnvelope<Operator>>(ROOT, payload);
    return res.data.data;
  },

  /** Renaming, moving, or standing somebody down. Never a delete - see the API. */
  async update(id: string, patch: Partial<Pick<Operator, 'name' | 'station' | 'note' | 'active'>>) {
    const res = await axiosClient.patch<ApiEnvelope<Operator>>(`${ROOT}/${id}`, patch);
    return res.data.data;
  },

  /** Every station for one shift, whether somebody is on it or not. */
  async roster(date: string, shift: Shift): Promise<ShiftRosterSlot[]> {
    const res = await axiosClient.get<ApiEnvelope<ShiftRosterSlot[]>>(`${ROOT}/roster`, {
      params: { date, shift },
    });
    return res.data.data;
  },

  /**
   * Put somebody on a line for a shift, or take them off it.
   *
   * A null `operatorId` clears the station. Saying "nobody" is a real answer and
   * a different one from never having been asked, so it is sent as a value.
   */
  async assign(payload: {
    date: string;
    shift: Shift;
    station: string;
    operatorId: string | null;
  }) {
    const res = await axiosClient.post<ApiEnvelope<unknown>>(`${ROOT}/roster`, payload);
    return res.data.data;
  },
};

export default operatorService;
