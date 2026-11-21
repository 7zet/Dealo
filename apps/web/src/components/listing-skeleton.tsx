import { DealCardSkeleton } from './deal-card';

/** Placeholder for a deal listing while its results load. */
export function ListingSkeleton() {
  return (
    <div className="mx-auto max-w-layout animate-pulse px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-10 w-2/3 rounded-control-ui bg-brand-tint sm:w-1/3" />
      <div className="mt-3 h-5 w-1/3 rounded-control-ui bg-brand-tint" />
      <div className="deal-grid mt-8">
        {Array.from({ length: 8 }, (_, index) => (
          <DealCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
