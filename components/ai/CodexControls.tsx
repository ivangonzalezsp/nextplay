'use client';

import { translate as t } from '@/lib/i18n';
import { useLanguage } from '@/components/header/LanguageSelector';
import {
    CODEX_MODELS,
    codexEffortsForModel,
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
}: {
    value: CodexSettings;
    onChange: (settings: CodexSettings) => void;
    idPrefix: string;
    disabled?: boolean;
}) {
    useLanguage();
    const models = [
        ...CODEX_MODELS.map((model) => ({ ...model, label: t(model.label) })),
        ...(CODEX_MODELS.some((model) => model.value === value.model)
            ? []
            : [
                  {
                      value: value.model,
                      label: value.model + t(' · configurado'),
                  },
              ]),
    ];
    const efforts = codexEffortsForModel(value.model).map((effort) => ({
        value: effort,
        label: t(
            effort === 'low'
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
                    value={value.model}
                    disabled={disabled}
                    items={models}
                    onValueChange={(model) => {
                        if (!model) return;
                        onChange({
                            model,
                            effort: codexEffortsForModel(model).includes(
                                value.effort,
                            )
                                ? value.effort
                                : 'medium',
                        });
                    }}
                >
                    <SelectTrigger
                        id={`${idPrefix}-model`}
                        className="w-full min-w-0 bg-black/30"
                    >
                        <SelectValue />
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
                    value={value.effort}
                    disabled={disabled}
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
                        <SelectValue />
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
        </div>
    );
}
