import * as React from "react"
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface TableColumn<T> {
  key: string
  label: string
  sortable?: boolean
  render?: (item: T) => React.ReactNode
  filterable?: boolean
  filterOptions?: string[] // explicit filter options
  getFilterValue?: (item: T) => string // function to get the filter value from item
}

interface DataTableProps<T> {
  data: T[]
  columns: TableColumn<T>[]
  searchable?: boolean
  searchPlaceholder?: string
  defaultSort?: { key: string; direction: 'asc' | 'desc' }
  onRowClick?: (item: T) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchable = true,
  searchPlaceholder = 'Search...',
  defaultSort,
  onRowClick,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = React.useState('')
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    defaultSort || null
  )
  const [filters, setFilters] = React.useState<Record<string, string>>({})

  // Get unique filter values for filterable columns
  const filterOptions = React.useMemo(() => {
    const options: Record<string, string[]> = {}
    columns.forEach(col => {
      if (col.filterable) {
        const values = new Set<string>()
        data.forEach(item => {
          const value = col.getFilterValue 
            ? col.getFilterValue(item) 
            : (col.key.includes('.') 
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? col.key.split('.').reduce((obj, key) => obj?.[key], item as any) 
                : item[col.key])
          if (value !== null && value !== undefined && value !== '') {
            values.add(String(value))
          }
        })
        options[col.key] = Array.from(values).sort()
      }
    })
    return options
  }, [data, columns])

  // Helper to extract text from React nodes for search
  const extractText = React.useCallback((node: React.ReactNode): string => {
    const extractTextRecursive = (n: React.ReactNode): string => {
      if (typeof n === 'string' || typeof n === 'number') {
        return String(n).toLowerCase()
      }
      if (React.isValidElement(n)) {
        const props = n.props as { children?: React.ReactNode }
        if (props?.children) {
          return extractTextRecursive(props.children)
        }
      }
      if (Array.isArray(n)) {
        return n.map(extractTextRecursive).join(' ')
      }
      return ''
    }
    return extractTextRecursive(node)
  }, [])

  const filteredAndSortedData = React.useMemo(() => {
    let filtered = [...data]

    // Apply column filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== '__all__') {
        const col = columns.find(c => c.key === key)
        filtered = filtered.filter(item => {
          const itemValue = col?.getFilterValue 
            ? col.getFilterValue(item)
            : (key.includes('.') 
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? key.split('.').reduce((obj, k) => obj?.[k], item as any) 
                : item[key])
          return String(itemValue) === value
        })
      }
    })

    // Apply search - search on actual data values, not rendered components
    if (searchable && searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter((item) => {
        // Search across all column keys
        return columns.some((col) => {
          const value = col.key.includes('.') 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? col.key.split('.').reduce((obj, k) => obj?.[k], item as any) 
            : item[col.key]
          if (value === null || value === undefined) return false
          return String(value).toLowerCase().includes(searchLower)
        }) || 
        // Also search on rendered text for better UX
        columns.some((col) => {
          if (col.render) {
            const rendered = col.render(item)
            const text = extractText(rendered)
            return text.includes(searchLower)
          }
          return false
        })
      })
    }

    // Apply sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        const aValue = sortConfig.key.includes('.') 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? sortConfig.key.split('.').reduce((obj, k) => obj?.[k], a as any) 
          : a[sortConfig.key]
        const bValue = sortConfig.key.includes('.') 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? sortConfig.key.split('.').reduce((obj, k) => obj?.[k], b as any) 
          : b[sortConfig.key]
        
        if (aValue === bValue) return 0
        
        const comparison = aValue < bValue ? -1 : 1
        return sortConfig.direction === 'asc' ? comparison : -comparison
      })
    }

    return filtered
  }, [data, searchTerm, sortConfig, columns, searchable, filters, extractText])

  const activeFilters = Object.entries(filters).filter(([, value]) => value && value !== '__all__')

  const clearFilter = (key: string) => {
    setFilters(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const clearAllFilters = () => {
    setFilters({})
  }

  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const getSortIcon = (columnKey: string) => {
    if (sortConfig?.key !== columnKey) {
      return <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-4 h-4 text-primary" />
    ) : (
      <ArrowDown className="w-4 h-4 text-primary" />
    )
  }

  const filterableColumns = columns.filter(col => col.filterable)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        {searchable && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
        
        {filterableColumns.map(col => (
          <Select
            key={col.key}
            value={filters[col.key] || '__all__'}
            onValueChange={(value) => setFilters(prev => ({ ...prev, [col.key]: value }))}
          >
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder={`Filter ${col.label}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All {col.label}s</SelectItem>
              {(col.filterOptions || filterOptions[col.key] || []).map(option => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {activeFilters.map(([key, value]) => {
            const col = columns.find(c => c.key === key)
            return (
              <Badge key={key} variant="secondary" className="gap-1">
                {col?.label}: {value}
                <X 
                  className="w-3 h-3 cursor-pointer hover:text-destructive" 
                  onClick={() => clearFilter(key)} 
                />
              </Badge>
            )
          })}
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear all
          </Button>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={column.sortable ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {column.sortable && getSortIcon(column.key)}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  No data found
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedData.map((item, idx) => (
                <TableRow 
                  key={idx}
                  className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.render ? column.render(item) : item[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
