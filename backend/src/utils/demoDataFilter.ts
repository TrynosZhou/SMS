/**
 * Utility functions to filter data for demo users
 * Demo users should only see data created by demo users (isDemo = true)
 */

import { AuthRequest } from '../middleware/auth';

/**
 * Check if the current user is a demo user
 */
export function isDemoUser(req: AuthRequest): boolean {
  return req.user?.isDemo === true;
}

/**
 * Get filter condition for demo users
 * Returns a condition object that filters to only show demo data
 */
export function getDemoDataFilter(req: AuthRequest): any {
  if (isDemoUser(req)) {
    // For demo users, only show data from demo users
    return { user: { isDemo: true } };
  }
  // For non-demo users, no filter (show all data)
  return {};
}

/**
 * Filter array of items to only include demo data if user is demo
 */
export function filterDemoData<T extends { user?: { isDemo?: boolean } }>(
  items: T[],
  req: AuthRequest
): T[] {
  if (isDemoUser(req)) {
    return items.filter(item => item.user?.isDemo === true);
  }
  return items;
}

