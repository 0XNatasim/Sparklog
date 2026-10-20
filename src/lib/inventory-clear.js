import { supabase } from '@/supabaseClient';

/**
 * Clears all negative inventory alerts (marks them as reviewed/resolved).
 * Adjust parameters if needed.
 */
export async function clearInventoryNegatives() {
  const { error } = await supabase.rpc('inventory_negative_clear');

  if (error) {
    console.error('[inventory-clear] RPC failed', error);
    throw error;
  }
}