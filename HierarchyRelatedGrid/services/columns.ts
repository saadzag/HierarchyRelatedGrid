import { DataRecord, EntityInfo, FORMATTED, LOOKUP_ENTITY } from "./dataService";
import { HIERARCHY_ID_KEY, HIERARCHY_NAME_KEY, LayoutCell } from "./fetchXml";

export interface GridColumn {
    key: string;
    label: string;
    width: number;
    /** Attribute logical name (without alias). */
    attribute: string;
    /** Link-entity alias when the column comes from a linked table. */
    alias?: string;
    isPrimaryName: boolean;
    isHierarchy: boolean;
    sortable: boolean;
}

export interface CellValue {
    text: string;
    lookup?: { entityName: string; id: string };
}

export function splitCellName(name: string): { alias?: string; attribute: string } {
    const dot = name.indexOf(".");
    return dot > 0 ? { alias: name.substring(0, dot), attribute: name.substring(dot + 1) } : { attribute: name };
}

export function buildColumns(
    cells: LayoutCell[],
    target: EntityInfo,
    linked: Record<string, EntityInfo>,
    hierarchy: EntityInfo,
    showHierarchyColumn: boolean,
): GridColumn[] {
    const columns: GridColumn[] = cells.map((cell) => {
        const { alias, attribute } = splitCellName(cell.name);
        const linkedInfo = alias ? linked[alias] : undefined;
        const label = linkedInfo
            ? `${linkedInfo.attributeLabels[attribute] ?? attribute} (${linkedInfo.displayName})`
            : target.attributeLabels[attribute] ?? attribute;
        return {
            key: cell.name,
            label,
            width: cell.width,
            attribute,
            alias,
            isPrimaryName: !alias && attribute === target.primaryNameAttribute,
            isHierarchy: false,
            sortable: !alias,
        };
    });

    // Without the primary name in the view, the first main-table column opens the record.
    if (!columns.some((c) => c.isPrimaryName)) {
        const first = columns.find((c) => !c.alias);
        if (first) {
            first.isPrimaryName = true;
        }
    }

    if (showHierarchyColumn) {
        const hierarchyColumn: GridColumn = {
            key: HIERARCHY_NAME_KEY,
            label: hierarchy.displayName,
            width: 200,
            attribute: HIERARCHY_NAME_KEY,
            isPrimaryName: false,
            isHierarchy: true,
            sortable: false,
        };
        columns.splice(Math.min(1, columns.length), 0, hierarchyColumn);
    }
    return columns;
}

function toText(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value as string | number | boolean);
}

export function getCellValue(record: DataRecord, column: GridColumn, hierarchyEntity: string): CellValue {
    if (column.isHierarchy) {
        const id = record[HIERARCHY_ID_KEY];
        return {
            text: toText(record[`${HIERARCHY_NAME_KEY}${FORMATTED}`] ?? record[HIERARCHY_NAME_KEY]),
            lookup: id ? { entityName: hierarchyEntity, id: toText(id) } : undefined,
        };
    }

    const base = column.alias ? `${column.alias}.${column.attribute}` : column.attribute;
    const candidates = column.alias
        ? [base, base.replace(".", "_x002e_")]
        : [`_${column.attribute}_value`, column.attribute];

    for (const key of candidates) {
        if (!(key in record)) {
            continue;
        }
        const raw = record[key];
        const text = toText(record[`${key}${FORMATTED}`] ?? raw);
        const entityName = record[`${key}${LOOKUP_ENTITY}`];
        return entityName && raw ? { text, lookup: { entityName: toText(entityName), id: toText(raw) } } : { text };
    }
    return { text: "" };
}
