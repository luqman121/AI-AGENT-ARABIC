"use client";

import { SearchField, Tabs } from "@wakil/ui";
import type { ProjectFilter } from "@wakil/shared";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const FILTER_TABS = [
  { label: "النشطة", value: "active" },
  { label: "المؤرشفة", value: "archived" },
];

/** Search and filter state live in the URL so results are shareable. */
export function ProjectsToolbar({
  filter,
  initialQuery,
}: {
  filter: ProjectFilter;
  initialQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(nextQuery: string, nextFilter: ProjectFilter) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextFilter !== "active") params.set("filter", nextFilter);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    router.replace(`${pathname}${suffix}`);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(value, filter), 300);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3 pb-1 pt-2">
      <SearchField
        label="ابحث في المشاريع"
        placeholder="ابحث بالاسم أو نص الطلب"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        onClear={() => handleQueryChange("")}
      />
      <Tabs
        items={FILTER_TABS}
        label="تصفية المشاريع"
        value={filter}
        onValueChange={(value) => navigate(query, value as ProjectFilter)}
      />
    </div>
  );
}
