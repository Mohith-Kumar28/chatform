"use client"

import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures
} from "@tanstack/react-table"

export const ORGANIZATION_TABLE_PAGE_SIZE = 10

/**
 * Breathing room for the people tables. The base cell is `h-10 px-3`, sized for
 * one line of text; a member row is an avatar over two lines, so it touched the
 * borders. Rows get vertical padding and the outer columns clear the card's
 * rounded edge.
 */
export const ORGANIZATION_TABLE_CLASS =
  "[&_td]:py-3 [&_td:first-child]:pl-5 [&_th:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:last-child]:pr-5 [&_th]:h-11"

export const organizationTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature
})

export const {
  createAppColumnHelper: createOrganizationColumnHelper,
  useAppTable: useOrganizationTable
} = createTableHook({
  enableMultiSort: true,
  sortDescFirst: false,
  features: organizationTableFeatures
})
