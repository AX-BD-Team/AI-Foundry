/**
 * ParameterInput — HITL component for collecting additional parameters.
 * Design Doc: AIF-DSGN-024 §3.7
 *
 * Renders a dynamic form based on field definitions and validates
 * required fields before submission.
 */

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface ParameterField {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[] | undefined;
  required?: boolean | undefined;
}

export interface ParameterInputProps {
  title: string;
  description: string;
  fields: ParameterField[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

/** Validate required fields. Returns names of missing required fields. Exported for testing. */
export function validateRequiredFields(
  fields: readonly ParameterField[],
  values: Readonly<Record<string, string>>,
): string[] {
  const missing: string[] = [];
  for (const f of fields) {
    if (f.required === true) {
      const val = values[f.name];
      if (val == null || val.trim() === "") {
        missing.push(f.name);
      }
    }
  }
  return missing;
}

export function ParameterInput({
  title,
  description,
  fields,
  onSubmit,
  onCancel,
}: ParameterInputProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.name] = "";
    }
    return init;
  });
  const [errors, setErrors] = useState<string[]>([]);

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => prev.filter((e) => e !== name));
  };

  const handleSubmit = () => {
    const missing = validateRequiredFields(fields, values);
    if (missing.length > 0) {
      setErrors(missing);
      return;
    }
    onSubmit(values);
  };

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 shadow-sm">
      {/* Header */}
      <div className="border-b border-amber-100 dark:border-amber-900 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {description}
        </p>
      </div>

      {/* Form Fields */}
      <div className="px-4 py-4 space-y-4">
        {fields.map((field) => {
          const hasError = errors.includes(field.name);
          const value = values[field.name] ?? "";

          return (
            <div key={field.name}>
              <label
                htmlFor={`param-${field.name}`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {field.label}
                {field.required === true && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </label>

              {field.type === "select" && field.options != null ? (
                <select
                  id={`param-${field.name}`}
                  value={value}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500",
                    hasError
                      ? "border-red-400 dark:border-red-600"
                      : "border-gray-300 dark:border-gray-600",
                  )}
                >
                  <option value="">선택하세요</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`param-${field.name}`}
                  type={field.type === "number" ? "number" : "text"}
                  value={value}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500",
                    hasError
                      ? "border-red-400 dark:border-red-600"
                      : "border-gray-300 dark:border-gray-600",
                  )}
                />
              )}

              {hasError && (
                <p className="text-xs text-red-500 mt-1">필수 입력 항목이에요.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-amber-100 dark:border-amber-900 px-4 py-3">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 rounded-md bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          제출
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}
