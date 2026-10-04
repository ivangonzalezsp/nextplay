'use client';

import { translate as t } from '@/lib/i18n';
import { useLanguage } from '@/components/header/LanguageSelector';
import {
    CODEX_MODELS,
    codexEffortsForModel,
    codexSettingsAvailable,
    type CodexModel,
    type CodexSettings,
} from '@/lib/model';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';

export function CodexControls({
    value,
    onChange,
    idPrefix,
    disabled = false,
    catalog,
}: {
    value: CodexSettings;
    onChange: (settings: CodexSettings) => void;
    idPrefix: string;
    disabled?: boolean;
    catalog?: CodexModel[] | null;
}) {
    useLanguage();
    const models = (catalog ?? []).map((entry) => ({
        value: entry.model,
        label: t(
            CODEX_MODELS.find((model) => model.value === entry.model)?.label ??
                entry.displayName,
        ),
    }));
    const efforts = (
        catalog ? codexEffortsForModel(value.model, catalog) : []
    ).map((effort) => ({
        value: effort,
        label: t(
            effort === 'none'
                ? 'Sin razonamiento'
                : effort === 'minimal'
                  ? 'Mínimo'
                  : effort === 'low'
                    ? 'Bajo · más rápido'
                    : effort === 'medium'
                      ? 'Medio · equilibrado'
                      : effort === 'high'
                        ? 'Alto · más razonado'
                        : effort === 'xhigh'
                          ? 'Muy alto'
                          : effort === 'max'
                            ? 'Máximo'
                            : 'Ultra',
        ),
    }));
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
                <label
                    htmlFor={`${idPrefix}-model`}
                    className="text-xs font-medium text-muted-foreground mb-1 block"
                >
                    {t('Modelo de Codex ')}
                </label>
                <Select
                    value={
                        models.some((model) => model.value === value.model)
                            ? value.model
                            : null
                    }
                    disabled={disabled || !models.length}
                    items={models}
                    onValueChange={(model) => {
                        const selected = catalog?.find(
                            (entry) => entry.model === model,
                        );
                        if (!model || !selected) return;
                        onChange({
                            model,
                            effort: codexEffortsForModel(
                                model,
                                catalog,
                            ).includes(value.effort)
                                ? value.effort
                                : selected.defaultEffort,
                        });
                    }}
                >
                    <SelectTrigger
                        id={`${idPrefix}-model`}
                        className="w-full min-w-0 bg-black/30"
                    >
                        <SelectValue
                            placeholder={t('Elige un modelo disponible')}
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {models.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                                {model.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="min-w-0">
                <label
                    htmlFor={`${idPrefix}-effort`}
                    className="text-xs font-medium text-muted-foreground mb-1 block"
                >
                    {t('Esfuerzo de Razonamiento ')}
                </label>
                <Select
                    value={
                        efforts.some((effort) => effort.value === value.effort)
                            ? value.effort
                            : null
                    }
                    disabled={disabled || !efforts.length}
                    items={efforts}
                    onValueChange={(effort) => {
                        if (effort)
                            onChange({
                                ...value,
                                effort: effort as CodexSettings['effort'],
                            });
                    }}
                >
                    <SelectTrigger
                        id={`${idPrefix}-effort`}
                        className="w-full min-w-0 bg-black/30"
                    >
                        <SelectValue
                            placeholder={t('Elige un esfuerzo disponible')}
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {efforts.map((effort) => (
                            <SelectItem key={effort.value} value={effort.value}>
                                {effort.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {(!catalog ||
                !catalog.length ||
                !codexSettingsAvailable(value, catalog)) && (
                <output className="col-span-full text-xs text-muted-foreground">
                    {t(
                        !catalog
                            ? 'No se ha podido consultar los modelos de Codex. Recarga o vuelve a conectar ChatGPT.'
                            : !catalog.length
                              ? 'No hay modelos disponibles en esta sesión. Conecta o revisa tu cuenta de ChatGPT.'
                              : 'La selección guardada no aparece en el catálogo actual de Codex. Elige otro modelo o esfuerzo.',
                    )}
                </output>
            )}
        </div>
    );
}
