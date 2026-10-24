import React from 'react';

export function AccessInventory({ keyMask, switchMask, empTurns = 0 }: { keyMask: number; switchMask: number; empTurns?: number }) {
  return <div className="race-inventory" data-testid="access-inventory">
    <small>YOUR ACCESS CORES</small>
    <div>{[{ bit: 1, name: 'Red' }, { bit: 2, name: 'Cyan' }, { bit: 4, name: 'Gold' }].map(key =>
      <span key={key.bit} className={keyMask & key.bit ? 'collected' : ''}>{key.name}: {keyMask & key.bit ? 'collected' : 'missing'}</span>
    )}</div>
    <p>Phase switch: {switchMask ? 'ON' : 'OFF'}{empTurns > 0 ? ` · EMP: ${empTurns} moves remaining` : ''}</p>
  </div>;
}
