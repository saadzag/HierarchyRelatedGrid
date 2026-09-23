import * as React from "react";
import {
    Button,
    FluentProvider,
    Link,
    MessageBar,
    MessageBarBody,
    Input,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableCellLayout,
    TableHeader,
    TableHeaderCell,
    TableRow,
    Text,
    Theme,
    Tooltip,
    makeStyles,
    tokens,
    webLightTheme,
} from "@fluentui/react-components";
import { ChevronDoubleLeftIcon, ChevronLeftIcon, ChevronRightIcon, DismissIcon, RefreshIcon, SearchIcon } from "./icons";
import { CellValue, GridColumn, buildColumns, getCellValue, splitCellName } from "../services/columns";
import {
    DataRecord,
    EntityInfo,
    FetchResult,
    Services,
    ViewDefinition,
    executeFetch,
    loadEntityInfo,
    loadView,
    normalizeGuid,
} from "../services/dataService";
import { SortOption, buildQuery, getDefaultSort, getLinkEntityMap, parseLayout } from "../services/fetchXml";

export interface HierarchyGridProps {
    services: Services;
    recordId: string;
    hierarchyEntity: string;
    viewId: string;
    lookupAttribute: string;
    includeCurrent: boolean;
    showHierarchyColumn: boolean;
    pageSize: number;
    theme?: Theme;
}

interface GridConfig {
    view: ViewDefinition;
    target: EntityInfo;
    hierarchy: EntityInfo;
    columns: GridColumn[];
    defaultSort?: SortOption;
}

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        rowGap: tokens.spacingVerticalS,
        width: "100%",
        backgroundColor: "transparent",
    },
    toolbar: {
        display: "flex",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        flexWrap: "wrap",
    },
    search: { minWidth: "220px", flexGrow: 1, maxWidth: "360px" },
    spacer: { flexGrow: 1 },
    tableWrapper: { overflowX: "auto", width: "100%" },
    table: { tableLayout: "fixed" },
    row: { cursor: "pointer" },
    cellText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    footer: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: tokens.spacingHorizontalS,
    },
    pager: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalXS },
    empty: { padding: tokens.spacingVerticalL, textAlign: "center", color: tokens.colorNeutralForeground3 },
});

const MAX_TOTAL_COUNT = 5000;

async function loadConfig(services: Services, viewId: string, hierarchyEntity: string, showHierarchyColumn: boolean): Promise<GridConfig> {
    const view = await loadView(services.webApi, viewId);
    const cells = parseLayout(view.layoutXml);
    const linkMap = getLinkEntityMap(view.fetchXml);

    const mainAttributes: string[] = [];
    const linkedAttributes: Record<string, string[]> = {};
    cells.forEach((cell) => {
        const { alias, attribute } = splitCellName(cell.name);
        if (!alias) {
            mainAttributes.push(attribute);
        } else if (linkMap[alias]) {
            (linkedAttributes[alias] = linkedAttributes[alias] ?? []).push(attribute);
        }
    });

    const [target, hierarchy, ...linkedInfos] = await Promise.all([
        loadEntityInfo(services.utils, view.entityName, mainAttributes),
        loadEntityInfo(services.utils, hierarchyEntity, []),
        ...Object.keys(linkedAttributes).map((alias) => loadEntityInfo(services.utils, linkMap[alias], linkedAttributes[alias])),
    ]);
    const linked: Record<string, EntityInfo> = {};
    Object.keys(linkedAttributes).forEach((alias, i) => {
        linked[alias] = linkedInfos[i];
    });

    return {
        view,
        target,
        hierarchy,
        columns: buildColumns(cells, target, linked, hierarchy, showHierarchyColumn),
        defaultSort: getDefaultSort(view.fetchXml),
    };
}

function recordIdOf(record: DataRecord, config: GridConfig): string {
    const id = record[config.target.primaryIdAttribute];
    return typeof id === "string" ? id : "";
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export const HierarchyGrid: React.FC<HierarchyGridProps> = (props) => {
    const { services, recordId, hierarchyEntity, viewId, lookupAttribute, includeCurrent, showHierarchyColumn, pageSize } = props;
    const styles = useStyles();

    const [config, setConfig] = React.useState<GridConfig>();
    const [configError, setConfigError] = React.useState<string>();
    const [result, setResult] = React.useState<FetchResult>();
    const [queryError, setQueryError] = React.useState<string>();
    const [loading, setLoading] = React.useState(false);
    const [page, setPage] = React.useState(1);
    const [sort, setSort] = React.useState<SortOption>();
    const [searchInput, setSearchInput] = React.useState("");
    const [search, setSearch] = React.useState("");
    const [refreshKey, setRefreshKey] = React.useState(0);
    const requestId = React.useRef(0);

    // Load the view and metadata once per configuration.
    React.useEffect(() => {
        let cancelled = false;
        setConfig(undefined);
        setConfigError(undefined);
        const run = async () => {
            try {
                const c = await loadConfig(services, viewId, hierarchyEntity, showHierarchyColumn);
                if (!cancelled) {
                    setConfig(c);
                    setSort(undefined);
                    setPage(1);
                }
            } catch (e) {
                if (!cancelled) {
                    setConfigError(errorMessage(e));
                }
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [services, viewId, hierarchyEntity, showHierarchyColumn]);

    // Debounced server-side search.
    React.useEffect(() => {
        const handle = window.setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 400);
        return () => window.clearTimeout(handle);
    }, [searchInput]);

    React.useEffect(() => {
        setPage(1);
    }, [recordId, includeCurrent, lookupAttribute, pageSize]);

    // Query the current page.
    React.useEffect(() => {
        if (!config || !recordId) {
            return;
        }
        const current = ++requestId.current;
        setLoading(true);
        setQueryError(undefined);
        let fetchXml: string;
        try {
            fetchXml = buildQuery({
                viewFetchXml: config.view.fetchXml,
                primaryIdAttribute: config.target.primaryIdAttribute,
                lookupAttribute,
                hierarchyEntity: config.hierarchy.logicalName,
                hierarchyIdAttribute: config.hierarchy.primaryIdAttribute,
                hierarchyNameAttribute: config.hierarchy.primaryNameAttribute,
                recordId,
                includeCurrent,
                pageSize,
                page,
                sort,
                search: search && config.target.primaryNameAttribute ? { attribute: config.target.primaryNameAttribute, text: search } : undefined,
            });
        } catch (e) {
            setQueryError(errorMessage(e));
            setLoading(false);
            return;
        }
        const run = async () => {
            try {
                const r = await executeFetch(services.clientUrl, config.target.entitySetName, fetchXml);
                if (current === requestId.current) {
                    setResult(r);
                }
            } catch (e) {
                if (current === requestId.current) {
                    setQueryError(errorMessage(e));
                }
            } finally {
                if (current === requestId.current) {
                    setLoading(false);
                }
            }
        };
        void run();
    }, [config, recordId, lookupAttribute, includeCurrent, pageSize, page, sort, search, refreshKey, services]);

    const openRecord = React.useCallback(
        (entityName: string, id: string, newWindow: boolean) => {
            void services.navigation.openForm({ entityName, entityId: normalizeGuid(id), openInNewWindow: newWindow });
        },
        [services],
    );

    const effectiveSort = sort ?? config?.defaultSort;
    const onSort = (column: GridColumn) => {
        if (!column.sortable) {
            return;
        }
        const descending = effectiveSort?.attribute === column.attribute ? !effectiveSort.descending : false;
        setSort({ attribute: column.attribute, descending });
        setPage(1);
    };

    const content = (() => {
        if (!recordId) {
            return <Text className={styles.empty}>Enregistrez la fiche pour afficher les enregistrements de la hiérarchie.</Text>;
        }
        if (configError) {
            return (
                <MessageBar intent="error">
                    <MessageBarBody>Configuration invalide : {configError}</MessageBarBody>
                </MessageBar>
            );
        }
        if (!config) {
            return <Spinner size="small" label="Chargement…" />;
        }
        return renderGrid(config);
    })();

    function renderCell(record: DataRecord, column: GridColumn, config: GridConfig) {
        const value: CellValue = getCellValue(record, column, config.hierarchy.logicalName);
        const recordKey = recordIdOf(record, config);
        let inner: React.ReactNode = value.text;
        if (column.isPrimaryName && recordKey) {
            inner = (
                <Link
                    onClick={(e) => {
                        e.stopPropagation();
                        openRecord(config.target.logicalName, recordKey, e.ctrlKey || e.metaKey);
                    }}
                >
                    {value.text || "(sans nom)"}
                </Link>
            );
        } else if (value.lookup && value.text) {
            const lookup = value.lookup;
            inner = (
                <Link
                    onClick={(e) => {
                        e.stopPropagation();
                        openRecord(lookup.entityName, lookup.id, e.ctrlKey || e.metaKey);
                    }}
                >
                    {value.text}
                </Link>
            );
        }
        return (
            <TableCell key={column.key}>
                <TableCellLayout truncate title={value.text}>
                    {inner}
                </TableCellLayout>
            </TableCell>
        );
    }

    function renderGrid(config: GridConfig) {
        const records = result?.records ?? [];
        const totalWidth = config.columns.reduce((sum, c) => sum + c.width, 0);
        const total = result?.totalCount ?? -1;
        const limitExceeded = (result?.totalCountLimitExceeded ?? false) || total >= MAX_TOTAL_COUNT;
        const pageCount = total >= 0 && !limitExceeded ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
        const countLabel = total < 0 ? "" : limitExceeded ? `${MAX_TOTAL_COUNT.toLocaleString()}+ enregistrements` : `${total.toLocaleString()} enregistrement${total > 1 ? "s" : ""}`;

        return (
            <>
                <div className={styles.tableWrapper}>
                    <Table className={styles.table} style={{ minWidth: `${totalWidth}px` }} sortable size="small" aria-label={config.view.name}>
                        <colgroup>
                            {config.columns.map((c) => (
                                <col key={c.key} style={{ width: `${c.width}px` }} />
                            ))}
                        </colgroup>
                        <TableHeader>
                            <TableRow>
                                {config.columns.map((c) => (
                                    <TableHeaderCell
                                        key={c.key}
                                        sortable={c.sortable}
                                        sortDirection={c.sortable && effectiveSort?.attribute === c.attribute ? (effectiveSort.descending ? "descending" : "ascending") : undefined}
                                        onClick={() => onSort(c)}
                                    >
                                        <span className={styles.cellText} title={c.label}>
                                            {c.label}
                                        </span>
                                    </TableHeaderCell>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {records.map((record, index) => {
                                const id = recordIdOf(record, config);
                                return (
                                    <TableRow
                                        key={id !== "" ? id : index}
                                        className={styles.row}
                                        tabIndex={0}
                                        onDoubleClick={(e) => openRecord(config.target.logicalName, id, e.ctrlKey || e.metaKey)}
                                        onKeyDown={(e) => e.key === "Enter" && openRecord(config.target.logicalName, id, e.ctrlKey || e.metaKey)}
                                    >
                                        {config.columns.map((c) => renderCell(record, c, config))}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    {!loading && !queryError && result && records.length === 0 && (
                        <div className={styles.empty}>Aucun enregistrement trouvé.</div>
                    )}
                </div>
                {queryError && (
                    <MessageBar intent="error">
                        <MessageBarBody>{queryError}</MessageBarBody>
                    </MessageBar>
                )}
                <div className={styles.footer}>
                    <Text size={200}>{countLabel}</Text>
                    <div className={styles.pager}>
                        {loading && <Spinner size="extra-tiny" />}
                        <Tooltip content="Première page" relationship="label">
                            <Button appearance="subtle" size="small" icon={<ChevronDoubleLeftIcon />} disabled={page <= 1 || loading} onClick={() => setPage(1)} />
                        </Tooltip>
                        <Tooltip content="Page précédente" relationship="label">
                            <Button appearance="subtle" size="small" icon={<ChevronLeftIcon />} disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} />
                        </Tooltip>
                        <Text size={200}>Page {page}{pageCount ? ` / ${pageCount}` : ""}</Text>
                        <Tooltip content="Page suivante" relationship="label">
                            <Button appearance="subtle" size="small" icon={<ChevronRightIcon />} disabled={!result?.moreRecords || loading} onClick={() => setPage(page + 1)} />
                        </Tooltip>
                    </div>
                </div>
            </>
        );
    }

    return (
        <FluentProvider theme={props.theme ?? webLightTheme} className={styles.root}>
            {recordId && config && (
                <div className={styles.toolbar}>
                    {config.target.primaryNameAttribute && (
                        <Input
                            className={styles.search}
                            size="small"
                            placeholder={`Rechercher (${config.target.attributeLabels[config.target.primaryNameAttribute] ?? config.target.primaryNameAttribute})`}
                            value={searchInput}
                            onChange={(_, data) => setSearchInput(data.value)}
                            contentBefore={<SearchIcon />}
                            contentAfter={
                                searchInput ? (
                                    <Button appearance="transparent" size="small" icon={<DismissIcon />} aria-label="Effacer" onClick={() => setSearchInput("")} />
                                ) : undefined
                            }
                        />
                    )}
                    <div className={styles.spacer} />
                    <Tooltip content="Actualiser" relationship="label">
                        <Button appearance="subtle" size="small" icon={<RefreshIcon />} disabled={loading} onClick={() => setRefreshKey((k) => k + 1)} />
                    </Tooltip>
                </div>
            )}
            {content}
        </FluentProvider>
    );
};
