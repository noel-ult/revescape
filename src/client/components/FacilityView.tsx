import React, { useEffect, useRef, useState } from 'react';
import { Box, Crosshair, Grid2X2, Minus, Plus, RotateCcw, Video } from 'lucide-react';
import { FacilityScene, CameraMode } from '../lib/facilityScene';
import { BlueprintGrid, PuzzleGridProps } from './BlueprintGrid';

export default function FacilityView(props: PuzzleGridProps) {
  const [savedTheme] = useState<'ion' | 'ember' | 'void'>(() => {
    try {
      const theme = localStorage.getItem('facility-theme');
      return theme === 'void' || theme === 'ember' ? theme : 'ion';
    } catch { return 'ion'; }
  });
  const effectiveProps = { ...props, theme: props.theme ?? savedTheme };
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<FacilityScene>();
  const latestProps = useRef(props);
  latestProps.current = effectiveProps;
  const [camera, setCamera] = useState<CameraMode>('orbit');
  const [blueprint, setBlueprint] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!host.current || blueprint || unavailable) return;
    try {
      scene.current = new FacilityScene(host.current, latestProps.current, () => setUnavailable(true));
      scene.current.setCamera(camera);
    } catch {
      setUnavailable(true);
    }
    return () => { scene.current?.dispose(); scene.current = undefined; };
  }, [blueprint, unavailable]);

  useEffect(() => { scene.current?.update(effectiveProps); }, [props, savedTheme]);

  const changeCamera = (mode: CameraMode) => {
    setCamera(mode);
    scene.current?.setCamera(mode);
  };
  const step = props.currentStep;
  return (
    <div className={`facility-view ${props.compact ? 'facility-view-compact' : ''}`} data-testid="facility-view">
      <div className="facility-view-toolbar">
        <div className="facility-view-title"><span className="status-light" />{props.viewMode === 'AI_FOG' ? 'SCOUT VISION' : 'LIVE ENVIRONMENT'}</div>
        <div className="facility-camera-tools">
          {(['orbit', 'top', 'follow'] as const).map((mode) => (
            <button key={mode} type="button" aria-label={`${mode} camera`} aria-pressed={camera === mode}
              disabled={blueprint || unavailable} className={camera === mode ? 'active' : ''} onClick={() => changeCamera(mode)}>
              {mode === 'orbit' ? <Box size={14} /> : mode === 'top' ? <Grid2X2 size={14} /> : <Video size={14} />}
              <span>{mode === 'orbit' ? 'Orbit' : mode === 'top' ? 'Plan' : 'Follow AI'}</span>
            </button>
          ))}
          <button type="button" aria-label="Toggle accessible blueprint" aria-pressed={blueprint} onClick={() => setBlueprint(!blueprint)}><Grid2X2 size={14} /></button>
        </div>
      </div>
      {blueprint || unavailable ? (
        <div className="facility-blueprint">
          {unavailable && <p>3D is unavailable on this device. You can still build and play in blueprint view.</p>}
          <BlueprintGrid {...props} />
        </div>
      ) : (
        <div className="facility-canvas-wrap">
          <div ref={host} className="facility-canvas" data-testid="facility-canvas" />
          <div className="facility-coordinates"><span>SECTOR 07 / RESEARCH COMPLEX</span><span>{camera === 'follow' ? 'TRACKING SCOUT 01' : 'ARCHITECTURAL VIEW'}</span></div>
          <div className="facility-view-zoom">
            <button aria-label="Zoom in" onClick={() => scene.current?.zoom(1)}><Plus size={16} /></button>
            <button aria-label="Zoom out" onClick={() => scene.current?.zoom(-1)}><Minus size={16} /></button>
            <button aria-label="Reset camera" onClick={() => changeCamera('orbit')}><RotateCcw size={15} /></button>
          </div>
          <div className="facility-agent-label"><Crosshair size={14} /><span>SCOUT 01</span><b>DECK {step?.level ?? 0} / {step ? step.event === 'EXIT' ? 'EXTRACTED' : 'EXPLORING' : 'STANDBY'}</b></div>
          <div className="facility-help">{camera === 'follow'
            ? 'Following Scout 01 · Walls cut away for visibility · Use Orbit or Plan to build'
            : props.interactive ? 'Click to build · Right-drag to orbit · Scroll to zoom · Two fingers on touch'
            : 'Drag to orbit · Scroll to zoom · Follow AI for a close-up'}</div>
        </div>
      )}
    </div>
  );
}
