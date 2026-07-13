interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-none">
          ⚠
        </span>
        <p className="text-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Try again
        </button>
      )}
    </div>
  );
}
