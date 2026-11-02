const CategoryCard = ({ category, selectedCategory, onSelectCategory }) => {
  const isSelected = selectedCategory === category._id;

  return (
    <div
      onClick={() => onSelectCategory(category._id)}
      className={`group cursor-pointer relative overflow-hidden rounded-2xl p-4 transition-all duration-300 border ${
        isSelected
          ? 'bg-emerald-50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
          : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-md shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform overflow-hidden">
          <img
            src={category.image}
            alt={category.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate group-hover:text-emerald-600 transition-colors">
            {category.name}
          </h4>
          <p className="text-xs text-slate-500 truncate">{category.description || 'Explore products'}</p>
        </div>
      </div>
    </div>
  );
};

export default CategoryCard;
