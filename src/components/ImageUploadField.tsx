import React, { useRef, useState } from 'react';
import { Camera, FileImage, Trash2, Upload } from 'lucide-react';

interface ImageUploadFieldProps {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  helperText?: string;
  acceptCamera?: boolean;
}

async function compressImageToDataUrl(file: File, maxDimension = 1280, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não é uma imagem válida.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível processar a imagem.'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  value,
  onChange,
  helperText,
  acceptCamera = false,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setProcessing(true);
    try {
      const compressed = await compressImageToDataUrl(file);
      onChange(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
        {label}
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={acceptCamera ? 'environment' : undefined}
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <img
            src={value}
            alt="Pré-visualização"
            className="h-16 w-16 shrink-0 rounded-md border border-slate-200 object-cover bg-white"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-800">Imagem anexada</p>
            <p className="text-xs text-slate-500">Pronta para salvar com o registro</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={processing}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-md border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
              title="Remover imagem"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
        >
          {acceptCamera ? (
            <Camera className="h-4 w-4 text-emerald-700" />
          ) : (
            <FileImage className="h-4 w-4 text-emerald-700" />
          )}
          <span>
            {processing ? 'Comprimindo imagem...' : 'Selecionar imagem (JPEG, PNG ou WebP)'}
          </span>
          <Upload className="h-4 w-4 text-slate-400" />
        </button>
      )}

      {helperText && <p className="text-xs text-slate-500">{helperText}</p>}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
};
