import { LocalizedError } from "./strings";

/** Alias used for the injected hierarchy link-entity and its aliased attributes. */
export const HIERARCHY_ALIAS = "hrg_hier";
export const HIERARCHY_ID_KEY = "hrg_hier_id";
export const HIERARCHY_NAME_KEY = "hrg_hier_name";

export interface SortOption {
    attribute: string;
    descending: boolean;
}

export interface QueryOptions {
    viewFetchXml: string;
    primaryIdAttribute: string;
    lookupAttribute: string;
    hierarchyEntity: string;
    hierarchyIdAttribute: string;
    hierarchyNameAttribute: string;
    recordId: string;
    includeCurrent: boolean;
    pageSize: number;
    page: number;
    sort?: SortOption;
    search?: { attribute: string; text: string };
}

export interface LayoutCell {
    name: string;
    width: number;
}

function parseXml(xml: string, what: string): Document {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) {
        throw new LocalizedError("Err_InvalidXml", [what]);
    }
    return doc;
}

function childElements(parent: Element, tagName: string): Element[] {
    return Array.from(parent.children).filter((c) => c.tagName === tagName);
}

function rootEntity(doc: Document): Element {
    const entity = childElements(doc.documentElement, "entity")[0];
    if (!entity) {
        throw new LocalizedError("Err_NoEntity");
    }
    return entity;
}

function appendAttribute(doc: Document, container: Element, name: string, alias?: string): void {
    const attr = doc.createElement("attribute");
    attr.setAttribute("name", name);
    if (alias) {
        attr.setAttribute("alias", alias);
    }
    container.appendChild(attr);
}

function appendOrder(doc: Document, container: Element, attribute: string, descending: boolean): void {
    const order = doc.createElement("order");
    order.setAttribute("attribute", attribute);
    order.setAttribute("descending", descending ? "true" : "false");
    container.appendChild(order);
}

/** Returns alias -> entity logical name for every link-entity of the view. */
export function getLinkEntityMap(viewFetchXml: string): Record<string, string> {
    const doc = parseXml(viewFetchXml, "fetchxml");
    const map: Record<string, string> = {};
    Array.from(doc.getElementsByTagName("link-entity")).forEach((le) => {
        const alias = le.getAttribute("alias");
        const name = le.getAttribute("name");
        if (alias && name) {
            map[alias] = name;
        }
    });
    return map;
}

/** Returns the first sort of the view's root entity, used as the initial sort indicator. */
export function getDefaultSort(viewFetchXml: string): SortOption | undefined {
    const order = childElements(rootEntity(parseXml(viewFetchXml, "fetchxml")), "order")[0];
    const attribute = order?.getAttribute("attribute");
    return attribute ? { attribute, descending: order.getAttribute("descending") === "true" } : undefined;
}

export function parseLayout(layoutXml: string): LayoutCell[] {
    const doc = parseXml(layoutXml, "layoutxml");
    return Array.from(doc.getElementsByTagName("cell"))
        .filter((cell) => cell.getAttribute("ishidden") !== "1" && !!cell.getAttribute("name"))
        .map((cell) => ({
            name: cell.getAttribute("name")!,
            width: parseInt(cell.getAttribute("width") ?? "", 10) || 150,
        }));
}

/**
 * Builds the paged query: view fetchxml + inner join on the hierarchy entity filtered
 * with the hierarchical operator (eq-or-under / under) on the current record.
 */
export function buildQuery(options: QueryOptions): string {
    const doc = parseXml(options.viewFetchXml, "fetchxml");
    const fetchEl = doc.documentElement;
    ["top", "page", "count", "paging-cookie", "returntotalrecordcount"].forEach((a) => fetchEl.removeAttribute(a));
    fetchEl.setAttribute("count", String(options.pageSize));
    fetchEl.setAttribute("page", String(options.page));
    fetchEl.setAttribute("returntotalrecordcount", "true");

    const entity = rootEntity(doc);
    const hasAllAttributes = childElements(entity, "all-attributes").length > 0;
    const hasPrimaryId = childElements(entity, "attribute").some((a) => a.getAttribute("name") === options.primaryIdAttribute);
    if (!hasAllAttributes && !hasPrimaryId) {
        appendAttribute(doc, entity, options.primaryIdAttribute);
    }

    const link = doc.createElement("link-entity");
    link.setAttribute("name", options.hierarchyEntity);
    link.setAttribute("from", options.hierarchyIdAttribute);
    link.setAttribute("to", options.lookupAttribute);
    link.setAttribute("link-type", "inner");
    link.setAttribute("alias", HIERARCHY_ALIAS);
    appendAttribute(doc, link, options.hierarchyIdAttribute, HIERARCHY_ID_KEY);
    appendAttribute(doc, link, options.hierarchyNameAttribute, HIERARCHY_NAME_KEY);
    const linkFilter = doc.createElement("filter");
    linkFilter.setAttribute("type", "and");
    const hierarchyCondition = doc.createElement("condition");
    hierarchyCondition.setAttribute("attribute", options.hierarchyIdAttribute);
    hierarchyCondition.setAttribute("operator", options.includeCurrent ? "eq-or-under" : "under");
    hierarchyCondition.setAttribute("value", options.recordId);
    linkFilter.appendChild(hierarchyCondition);
    link.appendChild(linkFilter);
    entity.appendChild(link);

    const searchText = options.search?.text.trim();
    if (options.search && searchText) {
        const searchFilter = doc.createElement("filter");
        searchFilter.setAttribute("type", "and");
        const condition = doc.createElement("condition");
        condition.setAttribute("attribute", options.search.attribute);
        condition.setAttribute("operator", "like");
        condition.setAttribute("value", `%${searchText.replace(/\[/g, "[[]")}%`);
        searchFilter.appendChild(condition);
        entity.appendChild(searchFilter);
    }

    if (options.sort) {
        Array.from(entity.getElementsByTagName("order")).forEach((o) => o.parentNode?.removeChild(o));
        appendOrder(doc, entity, options.sort.attribute, options.sort.descending);
    }
    // Unique tie-breaker so that page boundaries are stable.
    const orders = childElements(entity, "order");
    if (!orders.some((o) => o.getAttribute("attribute") === options.primaryIdAttribute)) {
        appendOrder(doc, entity, options.primaryIdAttribute, false);
    }

    return new XMLSerializer().serializeToString(doc);
}
