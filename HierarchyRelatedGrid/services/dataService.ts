export type DataRecord = Record<string, unknown>;

export interface ViewDefinition {
    name: string;
    entityName: string;
    fetchXml: string;
    layoutXml: string;
}

export interface FetchResult {
    records: DataRecord[];
    totalCount: number;
    totalCountLimitExceeded: boolean;
    moreRecords: boolean;
}

/** Subset of the entity metadata returned by context.utils.getEntityMetadata. */
export interface EntityInfo {
    logicalName: string;
    entitySetName: string;
    primaryIdAttribute: string;
    primaryNameAttribute: string;
    displayName: string;
    attributeLabels: Record<string, string>;
}

export interface Services {
    webApi: ComponentFramework.WebApi;
    utils: ComponentFramework.Utility;
    navigation: ComponentFramework.Navigation;
    clientUrl: string;
}

export const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
export const LOOKUP_ENTITY = "@Microsoft.Dynamics.CRM.lookuplogicalname";

export function normalizeGuid(id: string | null | undefined): string {
    return (id ?? "").replace(/[{}]/g, "").toLowerCase();
}

export async function loadView(webApi: ComponentFramework.WebApi, viewId: string): Promise<ViewDefinition> {
    const id = normalizeGuid(viewId);
    const select = "?$select=name,returnedtypecode,fetchxml,layoutxml";
    for (const table of ["savedquery", "userquery"]) {
        try {
            const view = await webApi.retrieveRecord(table, id, select);
            return {
                name: String(view.name ?? ""),
                entityName: String(view.returnedtypecode ?? ""),
                fetchXml: String(view.fetchxml ?? ""),
                layoutXml: String(view.layoutxml ?? ""),
            };
        } catch {
            // Try the next view table.
        }
    }
    throw new Error(`View not found or not accessible: ${viewId}`);
}

interface RawAttribute {
    LogicalName?: string;
    DisplayName?: string | { UserLocalizedLabel?: { Label?: string } };
}

interface RawMetadata {
    EntitySetName?: string;
    PrimaryIdAttribute?: string;
    PrimaryNameAttribute?: string;
    DisplayName?: string | { UserLocalizedLabel?: { Label?: string } };
    Attributes?: unknown;
}

function labelOf(value: RawAttribute["DisplayName"]): string | undefined {
    return typeof value === "string" ? value : value?.UserLocalizedLabel?.Label;
}

/** The Attributes collection shape differs between hosts: handle get(), _collection, arrays and plain objects. */
function findAttribute(attributes: unknown, name: string): RawAttribute | undefined {
    if (!attributes) {
        return undefined;
    }
    const collection = attributes as {
        get?: (n: string) => RawAttribute | undefined;
        _collection?: Record<string, RawAttribute>;
    };
    if (typeof collection.get === "function") {
        return collection.get(name);
    }
    if (collection._collection) {
        return collection._collection[name];
    }
    if (Array.isArray(attributes)) {
        return (attributes as RawAttribute[]).find((a) => a.LogicalName === name);
    }
    return (attributes as Record<string, RawAttribute>)[name];
}

export async function loadEntityInfo(utils: ComponentFramework.Utility, logicalName: string, attributes: string[]): Promise<EntityInfo> {
    const md = (await utils.getEntityMetadata(logicalName, attributes)) as RawMetadata;
    const attributeLabels: Record<string, string> = {};
    attributes.forEach((a) => {
        attributeLabels[a] = labelOf(findAttribute(md.Attributes, a)?.DisplayName) ?? a;
    });
    return {
        logicalName,
        entitySetName: md.EntitySetName ?? "",
        primaryIdAttribute: md.PrimaryIdAttribute ?? `${logicalName}id`,
        primaryNameAttribute: md.PrimaryNameAttribute ?? "",
        displayName: labelOf(md.DisplayName) ?? logicalName,
        attributeLabels,
    };
}

/**
 * Runs the fetchxml through the Web API directly (not context.webAPI) so that
 * total count and more-records annotations are available for server-side paging.
 */
export async function executeFetch(clientUrl: string, entitySetName: string, fetchXml: string): Promise<FetchResult> {
    const url = `${clientUrl}/api/data/v9.2/${entitySetName}?fetchXml=${encodeURIComponent(fetchXml)}`;
    const response = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            Prefer: 'odata.include-annotations="*"',
        },
    });
    const body = (await response.json()) as DataRecord & { error?: { message?: string } };
    if (!response.ok) {
        throw new Error(body.error?.message ?? `Error ${response.status} while retrieving the records.`);
    }
    return {
        records: (body.value as DataRecord[]) ?? [],
        totalCount: Number(body["@Microsoft.Dynamics.CRM.totalrecordcount"] ?? -1),
        totalCountLimitExceeded: body["@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded"] === true,
        moreRecords: body["@Microsoft.Dynamics.CRM.morerecords"] === true,
    };
}
