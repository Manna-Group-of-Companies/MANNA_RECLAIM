import { axiosClient } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope } from '@/types/api';
import type { LabourBoard, Operator, Shift } from '@/types/models';

const get = async <T>(url: string, params?: unknown): Promise<T> => {
  const { data } = await axiosClient.get<ApiEnvelope<T>>(url, { params });
  return data.data;
};

/**
 * The gate, and the board the supervisor deploys off it.
 *
 * Nothing here posts a punch. The reader is on the plant LAN and this app is
 * not, so punches arrive through /sync from a script inside the plant - see the
 * server's attendance.service. What a tablet does is read who came in and say
 * where they went.
 */
export const attendanceService = {
  forShift: (params: { date: string; shift: Shift }) =>
    get<LabourBoard>(endpoints.attendance.shift, params),

  /** A null station takes them off wherever they were, which is not an error. */
  assign: async (body: {
    date: string;
    shift: Shift;
    code: string;
    station: string | null;
  }) => {
    const { data } = await axiosClient.post<ApiEnvelope<unknown>>(
      endpoints.attendance.assign,
      body,
    );
    return data.data;
  },

  claim: async (body: { code: string; name: string; station?: string | null }) => {
    const { data } = await axiosClient.post<ApiEnvelope<Operator>>(
      endpoints.attendance.claim,
      body,
    );
    return data.data;
  },
};

export default attendanceService;
