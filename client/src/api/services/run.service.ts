import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Run, Quality, Shift } from '@/types/models';

export interface StartRunPayload {
  machineId: string;
  batchId?: string | null;
  batchNo?: string | null;
  line?: string | null;
  /** Copied off the picked batch so the stop sheet can name it. */
  formulation?: string | null;
  /** The grinding line's feedstock for this shift, and the crumb it yields. */
  tyreType?: string | null;
  mesh?: string | null;
  quality?: Quality | null;
  shiftDate?: string;
  shift?: Shift;
  supervisor?: string | null;
  workers?: number | null;
  /** An autoclave charged alongside its twin, so the crew is shared. */
  paired?: boolean;
  /**
   * When the run actually began, for a sheet that asks: the autoclave load
   * sheet takes a loading time. Left out, the server stamps the moment it is
   * told about the run.
   */
  startedAt?: string;
  /** Meter readings taken off the machine as it starts (refiner line). */
  elecStart?: number | null;
  hourStart?: number | null;
  /** The special line's rare pass that yields nothing to weigh. */
  nonProduction?: boolean;
  /**
   * The batches a special-line pass draws from: the one being refined first,
   * then the tailings of others mixed into it. Up to four in all.
   */
  sources?: string[] | null;
  /**
   * A moulding press: the product it is set up for, and the two settings the
   * floor may change for this run - the cure, and the mould that is on. The
   * curing temperature and the compound rate are not sent: the server copies
   * both off the product, so a tablet cannot name what a run cost.
   */
  product?: string | null;
  cyclicMin?: number | null;
  cavities?: number | null;
}

export interface StopRunPayload {
  /** The unloading time an autoclave sheet asks for; blank means now. */
  stoppedAt?: string;
  outWeight?: number | null;
  workers?: number | null;
  remarks?: string | null;
  /** Meter readings at stop; the server turns each pair into a difference. */
  elecEnd?: number | null;
  hourEnd?: number | null;
  /** The differences themselves, for when only those are known. */
  kwh?: number | null;
  hoursRun?: number | null;
  firewoodKg?: number | null;
  /**
   * The three moments inside an autoclave cycle, taken at the discharge.
   *
   * `pressureAt` splits the heat-up off the cook; the two door times are a pair
   * and the gap between them is the vessel standing open being emptied and
   * re-charged, which is what the plant calls its loading time. Only the
   * autoclave sheet sends them.
   */
  pressureAt?: string;
  doorOpenAt?: string;

  /** What came off a press: the pieces moulded, and the flash trimmed away. */
  pieces?: number | null;
  flashKg?: number | null;
  /**
   * The picking gang on a cracker shift - how many were put on pulling scrap
   * tyres out of the yard, and roughly how long they were at it. Only the
   * cracker's sheet asks, and the server ignores it from anything else.
   */
  pickingLabourers?: number | null;
  pickingHours?: number | null;
}

/**
 * A correction to a run already on record. Only the fields sent are touched,
 * and the server re-derives energy and hours from whichever readings change.
 */
export interface UpdateRunPayload {
  batchNo?: string | null;
  formulation?: string | null;
  quality?: Quality | null;
  shiftDate?: string;
  shift?: Shift;
  supervisor?: string | null;
  workers?: number | null;
  elecStart?: number | null;
  elecEnd?: number | null;
  hourStart?: number | null;
  hourEnd?: number | null;
  kwh?: number | null;
  hoursRun?: number | null;
  outWeight?: number | null;
  firewoodKg?: number | null;
  capacity?: number | null;
  packedSacks?: number | null;
  remarks?: string | null;
  /** A press run's own figures - its compound rate is not correctable. */
  product?: string | null;
  cavities?: number | null;
  cyclicMin?: number | null;
  pieces?: number | null;
  flashKg?: number | null;
  /** The picking gang on a cracker shift, as the supervisor remembers it. */
  pickingLabourers?: number | null;
  pickingHours?: number | null;
}

/** What a deleted run was carrying, so the screen can name what it removed. */
export interface RemovedRun {
  id: string;
  machine_id: string;
  machine?: string | null;
  shift_date?: string | null;
  shift?: Shift | null;
  batch_no?: string | null;
  weight_kg?: number | null;
  /**
   * What went with it. A run is not only its own row: what it packed was
   * standing in the yard and what the bench tested was on the lab's table, and
   * a delete takes both. The screen says so rather than leaving the crew to
   * wonder whether the stock moved - see the History tab.
   */
  stock_cleared?: {
    id: string;
    label: string;
    /** Taken back out of that group by this delete. */
    taken: number;
    /** What the group holds now. */
    left?: number | null;
    /**
     * The group emptied completely and was deleted with the run - nothing was
     * ever made and nothing ever left it, so there is no yard row to explain.
     * A group that has dispatched is kept, and this is false.
     */
    removed?: boolean;
  } | null;
  /** Packed output no group could be found for - unaccounted for in the yard. */
  stock_note?: string | null;
  quality_tests_deleted?: number;
  /**
   * What the delete took back off the batch card.
   *
   * A run does not only write its own row: an autoclave pass marks its batch as
   * out of the vessel and a settling refiner pass ticks the grade it made, both
   * of which live in the plant's batch record rather than on the run. Deleting
   * the run takes those back where nothing else still on record says them - so
   * the screen names them, because a supervisor who finds a grade unticked
   * tomorrow should be able to remember that this is why.
   *
   * Null when the run had nothing to take back, which is the ordinary case.
   */
  batch_cleared?: {
    ref: string;
    /** The batch reads as still in the autoclave again - no load run is left. */
    discharge_cleared: boolean;
    /** Grades unticked because no remaining run makes them. */
    qualities_cleared: string[];
  } | null;
}

/**
 * What undoing a packing gave back.
 *
 * The run itself, because it is still there - that is the whole difference
 * between this and a delete - and it comes back unpacked, so the list can put
 * the card straight back on the bench without asking the server again. The
 * yard half is the same shape a run delete reports, and means the same thing.
 */
export interface UnpackedRun {
  run: Run;
  stock_cleared?: RemovedRun['stock_cleared'];
  stock_note?: string | null;
}

/**
 * What clearing a weighing gave back.
 *
 * The run itself, because it is still there - the same difference this has from
 * a delete that unpack() has - and it comes back owing a weight, so the Weigh
 * tab can put the card straight back on the queue without asking again. The
 * figure that was cleared travels with it so the screen can name what it removed
 * rather than only that a row moved.
 */
export interface UnweighedRun {
  run: Run;
  weight_kg: number | null;
  entries_cleared: number;
}

/**
 * What came off a finished run and into the yard.
 *
 * Two benches, one route. A weighed run is bagged into 50 kg sacks and reports
 * the sub-sack remainder it carries into the next batch of the same grade; a
 * press run is boxed by the piece and has neither a weight to divide nor
 * anything to carry forward. The run decides which applies - a press cannot be
 * packed in sacks and a refiner cannot be packed in pieces - and the API refuses
 * the wrong one rather than ignoring it.
 */
export interface PackRunPayload {
  sacks?: number;
  leftoutIn?: number | null;
  leftoutOut?: number | null;
  /** Boxed pieces off a press run. */
  pieces?: number;
}

export const runService = {
  list: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.root, params),
  listActive: () => requestPaged<Run>(endpoints.runs.active),
  /** Finished runs on a weighed machine still waiting for their out-weight. */
  listPendingWeigh: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.pendingWeigh, params),
  /** Runs already weighed, newest first - what the Weigh tab corrects from. */
  listWeighed: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.weighed, params),
  /** Weighed runs that still have full sacks to bag. */
  listPendingPack: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.pendingPack, params),
  /** Packed sacks not yet dispatched - the Stock tab's stock list. */
  listPacked: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.packed, params),
  byShift: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.shift, params),

  async start(payload: StartRunPayload): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.start, payload);
    return res.data.data;
  },

  async stop(id: string, payload: StopRunPayload): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.stop(id), payload);
    return res.data.data;
  },

  /**
   * Records the out-weight of a run that has already finished - and corrects
   * one already weighed, which is the same write. `entries` are the individual
   * weighings the total came off, kept so a correction can show them.
   */
  async weigh(id: string, outWeight: number, entries?: number[]): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.weigh(id), {
      outWeight,
      ...(entries ? { entries } : {}),
    });
    return res.data.data;
  },

  /**
   * Replaces the running tally on a machine that is still going. The whole list
   * goes every time, so adding a load and removing one are the same call.
   */
  async tally(id: string, entries: number[]): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.tally(id), { entries });
    return res.data.data;
  },

  /**
   * Takes the weighing back off a run and puts it back on the scale queue - the
   * Weigh tab's delete.
   *
   * Not remove(). The run stays: it happened, the machine logged its hours, and
   * the reports are added up off that row - clearing a figure entered against
   * the wrong run is no reason to rewrite the plant's production record. A
   * mistyped weight is not this either; that is weigh() again, which the floor
   * may call all day. Refused by the server once anything has been packed off
   * the weight, and it names the Packing tab.
   */
  async unweigh(id: string): Promise<UnweighedRun> {
    const res = await axiosClient.delete<ApiEnvelope<UnweighedRun>>(endpoints.runs.weigh(id));
    return res.data.data;
  },

  /** Records the sacks bagged off a weighed run. */
  async pack(id: string, payload: PackRunPayload): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.pack(id), payload);
    return res.data.data;
  },

  /**
   * Takes the packing back off a run and the stock back out of the yard - the
   * Packing tab's delete.
   *
   * Not remove(). The run stays: it happened, the machine logged its hours and
   * the reports are added up off that row, and undoing a counting mistake is no
   * reason to rewrite the plant's production record. What comes back is the run
   * as it now stands - unpacked, and back on the packing list - beside the same
   * `stock_cleared` a run delete reports, so the screen can name what left the
   * yard. Refused by the server once any of it has been dispatched.
   */
  async unpack(id: string): Promise<UnpackedRun> {
    const res = await axiosClient.delete<ApiEnvelope<UnpackedRun>>(endpoints.runs.pack(id));
    return res.data.data;
  },

  /** Corrects a logged run - either History tab. */
  async update(id: string, payload: UpdateRunPayload): Promise<Run> {
    const res = await axiosClient.patch<ApiEnvelope<Run>>(endpoints.runs.byId(id), payload);
    return res.data.data;
  },

  /**
   * Takes a logged run off the record for good - the History tab's delete.
   * There is no way back from it, so the tab confirms against the named run
   * before it calls this.
   */
  async remove(id: string): Promise<RemovedRun> {
    const res = await axiosClient.delete<ApiEnvelope<RemovedRun>>(endpoints.runs.byId(id));
    return res.data.data;
  },

  /** Discards a run started by mistake - nothing is logged against it. */
  async cancel(id: string): Promise<{ id: string }> {
    const res = await axiosClient.post<ApiEnvelope<{ id: string }>>(endpoints.runs.cancel(id));
    return res.data.data;
  },

  async pause(id: string, paused: boolean): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.pause(id), { paused });
    return res.data.data;
  },

  /** Flushes locally queued runs after an offline stretch. */
  async sync(rows: Partial<Run>[]): Promise<Run[]> {
    const res = await axiosClient.post<ApiEnvelope<Run[]>>(endpoints.runs.sync, { rows });
    return res.data.data;
  },
};

export default runService;
