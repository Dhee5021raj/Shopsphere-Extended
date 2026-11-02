import React from 'react';
import { Star } from 'lucide-react';

const RatingStars = ({ rating = 0, numReviews, size = 16, interactive = false, onChange }) => {
  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="flex items-center gap-1">
      {stars.map((star) => (
        <Star
          key={star}
          size={size}
          className={`${
            star <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-slate-600'
          } ${interactive ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
          onClick={() => interactive && onChange && onChange(star)}
        />
      ))}
      {numReviews !== undefined && (
        <span className="text-xs text-slate-400 font-medium ml-1">
          ({numReviews})
        </span>
      )}
    </div>
  );
};

export default RatingStars;
