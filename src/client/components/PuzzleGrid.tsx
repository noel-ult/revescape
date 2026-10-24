import React, { lazy, Suspense } from 'react';
import type { PuzzleGridProps } from './BlueprintGrid';

const FacilityView = lazy(() => import('./FacilityView'));

/** Shared world renderer: all movement comes from the simulation's real step data. */
export const PuzzleGrid: React.FC<PuzzleGridProps> = (props) => (
  <Suspense fallback={<div className="facility-loading">Assembling facility…</div>}>
    <FacilityView {...props} />
  </Suspense>
);
