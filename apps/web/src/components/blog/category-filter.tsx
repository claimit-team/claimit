"use client";

import { type Category, categories } from "@/lib/blog-data";
import { cn } from "@/lib/utils";

interface CategoryFilterProps {
  selectedCategory: Category;
  onCategoryChange: (category: Category) => void;
}

export function CategoryFilter({ selectedCategory, onCategoryChange }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onCategoryChange(category)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            selectedCategory === category
              ? "bg-neutral-900 text-neutral-0"
              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
          )}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
