import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCw, Trash2, X } from 'lucide-react';
import { compressImageToDataUrl } from '../lib/api';

interface ImageCaptureFieldProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  onError?: (message: string) => void;
  buttonLabel?: string;
}

export function ImageCaptureField({
  value,
  onChange,
  onError,
  buttonLabel = 'Inserir foto de perfil',
}: ImageCaptureFieldProps) {
  const [step, setStep] = useState<'closed' | 'choose' | 'camera'>('closed');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  function closeModal() {
    stopCameraStream();
    setCameraError(null);
    setStep('closed');
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 320);
      onChange(compressed);
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar imagem.';
      setCameraError(msg);
      onError?.(msg);
    }
  }

  async function openDeviceCamera(nextFacing: 'user' | 'environment' = facingMode) {
    setCameraError(null);
    stopCameraStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      nativeCameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setStep('camera');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setCameraError(
        'Não foi possível abrir a câmera ao vivo diretamente. Tentando abrir a câmera nativa ou escolha uma foto da galeria.'
      );
      nativeCameraInputRef.current?.click();
    }
  }

  async function toggleFacing() {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    await openDeviceCamera(next);
  }

  function captureSnapshot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const maxSize = 320;
    const ratio = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight, 1);
    const w = Math.max(1, Math.round(video.videoWidth * ratio));
    const h = Math.max(1, Math.round(video.videoHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    onChange(dataUrl);
    closeModal();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCameraError(null);
            setStep('choose');
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
        >
          <Camera className="h-4 w-4 text-emerald-600" />
          {buttonLabel}
        </button>

        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600 cursor-pointer whitespace-nowrap"
            title="Remover foto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remover
          </button>
        )}
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
      />
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileSelected}
        className="hidden"
      />

      {step !== 'closed' && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Selecionar origem da imagem"
        >
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-900">
                {step === 'camera' ? 'Câmera do dispositivo' : 'Como deseja inserir a imagem?'}
              </h4>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {cameraError && (
              <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {cameraError}
              </div>
            )}

            {step === 'choose' ? (
              <div className="p-5 space-y-3">
                <button
                  type="button"
                  onClick={() => openDeviceCamera()}
                  className="w-full flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5 text-left hover:bg-emerald-100/80 transition-colors cursor-pointer"
                >
                  <span className="h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Camera className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="block text-sm font-bold text-slate-900">
                      Abrir câmera do dispositivo
                    </span>
                    <span className="block text-xs text-slate-600">
                      Tire uma foto agora pelo celular, tablet ou computador.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className="h-10 w-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <ImagePlus className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="block text-sm font-bold text-slate-900">
                      Carregar imagem da galeria
                    </span>
                    <span className="block text-xs text-slate-600">
                      Escolha uma foto já salva no seu aparelho.
                    </span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="p-4 bg-slate-950 text-white space-y-3">
                <div className="relative overflow-hidden rounded-lg bg-black aspect-square max-h-72 mx-auto flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={toggleFacing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Trocar câmera
                  </button>
                  <button
                    type="button"
                    onClick={captureSnapshot}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Tirar foto
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setStep('choose');
                  }}
                  className="w-full text-center text-xs text-slate-400 hover:text-white pt-1 cursor-pointer"
                >
                  Voltar às opções
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
