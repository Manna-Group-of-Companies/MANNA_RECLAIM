import { z } from 'zod';

export const createMaintenanceSchema = z.object({
  machine_id: z.string().min(1),
  kind: z.enum(['breakdown', 'service', 'inspection', 'other']).default('breakdown'),
  title: z.string().min(3),
  detail: z.string().max(1000).optional().nullable(),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  logged_at: z.string().datetime().optional(),
  status: z.enum(['open', 'closed']).default('open'),
});

export const resolveSchema = z.object({ remarks: z.string().max(500).optional() });

export const bearingLogSchema = z.object({
  machineId: z.string().min(1),
  kind: z.enum(['bearing', 'bush']).default('bearing'),
  positions: z.array(z.string()).max(8).optional().nullable(),
  ts: z.string().datetime().optional(),
  remarks: z.string().max(300).optional().nullable(),
});
