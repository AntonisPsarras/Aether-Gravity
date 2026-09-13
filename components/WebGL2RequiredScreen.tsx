import React from 'react';
import { MonitorX } from 'lucide-react';

const WebGL2RequiredScreen: React.FC = () => (
  <div
    data-testid="webgl2-required"
    className="min-h-dvh bg-void-navy text-pulsar-white flex items-center justify-center safe-pad p-6"
  >
    <div className="max-w-md w-full panel-glass rounded-xl p-6 ring-1 ring-white/10 shadow-2xl text-center">
      <MonitorX size={32} className="text-nebula-rust mx-auto mb-4" aria-hidden />
      <h1 className="text-lg font-bold mb-2">WebGL2 is required</h1>
      <p className="text-sm text-pulsar-white/50">
        Aether Gravity needs a WebGL2-capable browser or device to run the simulation.
        This machine did not provide a WebGL2 context, so the 3D view was not started.
      </p>
    </div>
  </div>
);

export default WebGL2RequiredScreen;
