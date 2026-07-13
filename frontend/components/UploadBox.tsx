"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const uploadSchema = z.object({
  file: z
    .instanceof(File, { message: "Select a CSV file to upload." })
    .refine((file) => file.name.toLowerCase().endsWith(".csv"), {
      message: "Only .csv files are accepted.",
    })
    .refine((file) => file.size > 0, { message: "The selected file is empty." })
    .refine((file) => file.size <= 200 * 1024 * 1024, {
      message: "File is too large (200MB limit).",
    }),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

interface UploadBoxProps {
  onSubmit: (file: File) => void;
  uploadProgress: number | null;
  disabled?: boolean;
}

export default function UploadBox({ onSubmit, uploadProgress, disabled }: UploadBoxProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    handleSubmit,
    setValue,
    formState: { errors },
    trigger,
  } = useForm<UploadFormValues>({ resolver: zodResolver(uploadSchema) });

  const applyFile = (file: File | undefined) => {
    if (!file) return;
    setSelectedFile(file);
    setValue("file", file);
    void trigger("file");
  };

  const submit = handleSubmit((values) => {
    onSubmit(values.file);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          applyFile(event.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(event) => applyFile(event.target.files?.[0])}
        />
        <p className="text-sm font-medium text-slate-700">
          {selectedFile ? selectedFile.name : "Drag & drop a CSV file here, or click to browse"}
        </p>
        <p className="text-xs text-slate-500">Only .csv files are accepted</p>
      </div>

      {errors.file && <p className="text-sm text-red-600">{errors.file.message}</p>}

      {uploadProgress !== null && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={!selectedFile || disabled}
        className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {uploadProgress !== null ? `Uploading… ${uploadProgress}%` : "Upload & Continue"}
      </button>
    </form>
  );
}
