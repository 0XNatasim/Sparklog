import { supabase } from '@/supabaseClient';
import { useT } from '@/lib/use-t';

/**
 * Returns the total number of negative inventory entries across all employees.
 * If you prefer "number of employees with a negative", change the reducer accordingly.
 */
export async function getInventoryNegativeTotal(): Promise<number> {
  const { data, error } = await supabase
    .rpc('inventory_negative_alerts') // returns { user_id, job_date, negative_count }
    .returns<{ user_id: string; job_date: string; negative_count: number }[]>();

  if (error) {
    console.error('[inventory-alerts] RPC failed', error);
    return 0;
  }

  // Sum the negative_count field – you can also do:
  //   return data.filter(d => d.negative_count > 0).length; // employees with any negative
  return data.reduce((sum, row) => sum + (row.negative_count ?? 0), 0);
}