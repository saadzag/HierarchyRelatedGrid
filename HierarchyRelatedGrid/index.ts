import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { HierarchyGrid, HierarchyGridProps } from "./components/HierarchyGrid";
import { Services, normalizeGuid } from "./services/dataService";
import { Theme } from "@fluentui/react-components";
import * as React from "react";

interface ContextInfo {
    entityId?: string;
    entityTypeName?: string;
}

interface ExtendedContext {
    mode: { contextInfo?: ContextInfo };
    page?: { getClientUrl?: () => string };
    fluentDesignLanguage?: { tokenTheme?: Theme };
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
    return values.find((v) => !!v) ?? "";
}

export class HierarchyRelatedGrid implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private services: Services;

    public init(context: ComponentFramework.Context<IInputs>): void {
        const extended = context as unknown as ExtendedContext;
        this.services = {
            webApi: context.webAPI,
            utils: context.utils,
            navigation: context.navigation,
            clientUrl: (extended.page?.getClientUrl?.() ?? "").replace(/\/$/, ""),
        };
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const extended = context as unknown as ExtendedContext;
        const info = extended.mode.contextInfo ?? {};
        const p = context.parameters;
        const pageSize = Math.min(250, Math.max(5, p.pageSize.raw ?? 25));

        const props: HierarchyGridProps = {
            services: this.services,
            recordId: normalizeGuid(info.entityId),
            hierarchyEntity: firstNonEmpty(p.hierarchyEntity.raw?.trim().toLowerCase(), info.entityTypeName, "account"),
            viewId: (p.viewId.raw ?? "").trim(),
            lookupAttribute: (p.lookupAttribute.raw ?? "").trim().toLowerCase(),
            includeCurrent: p.includeCurrentRecord.raw !== "0",
            showHierarchyColumn: p.showHierarchyColumn.raw !== "0",
            pageSize,
            theme: extended.fluentDesignLanguage?.tokenTheme,
        };
        return React.createElement(HierarchyGrid, props);
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // Nothing to clean up: pending requests are ignored by the component once unmounted.
    }
}
