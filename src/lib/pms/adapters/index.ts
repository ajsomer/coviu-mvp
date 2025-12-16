import type { PMSAdapter, PMSType } from '../types';
import { GentuAdapter } from './gentu';

const adapters: Record<PMSType, () => PMSAdapter> = {
  gentu: () => new GentuAdapter(),
  medirecords: () => {
    throw new Error('Medirecords adapter not implemented yet');
  },
  halaxy: () => {
    throw new Error('Halaxy adapter not implemented yet');
  },
};

/**
 * Get a PMS adapter instance by type
 */
export function getAdapter(pmsType: PMSType): PMSAdapter {
  const factory = adapters[pmsType];
  if (!factory) {
    throw new Error(`Unknown PMS type: ${pmsType}`);
  }
  return factory();
}

/**
 * Check if a PMS type is supported
 */
export function isAdapterAvailable(pmsType: PMSType): boolean {
  try {
    getAdapter(pmsType);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of available PMS types
 */
export function getAvailablePmsTypes(): PMSType[] {
  return (Object.keys(adapters) as PMSType[]).filter(type => {
    try {
      getAdapter(type);
      return true;
    } catch {
      return false;
    }
  });
}

// Re-export adapters
export { GentuAdapter };
