import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toLocalInput } from "../lib/format";
import { Button, Field, Input, Textarea } from "./ui";

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Client-side validation mirrors the backend and contract limits so users get instant
 * feedback. It is NOT a security control: the API re-validates every field.
 */
export const electionFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must have at least 3 characters")
      .refine((s) => utf8Bytes(s) <= 160, "Title is too long (max 160 bytes)"),
    description: z.string().trim().max(2000, "Description is too long"),
    options: z
      .array(
        z.object({
          label: z
            .string()
            .trim()
            .min(1, "Option label is required")
            .refine((s) => utf8Bytes(s) <= 80, "Label is too long (max 80 bytes)"),
        }),
      )
      .min(2, "At least two options are required")
      .max(10, "At most ten options are allowed")
      .refine((o) => new Set(o.map((x) => x.label.trim().toLowerCase())).size === o.length, "Option labels must be unique"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    quorumPercent: z.number({ error: "Enter a number" }).min(0, "Min 0%").max(100, "Max 100%"),
  })
  .refine((v) => Date.parse(v.endTime) > Date.parse(v.startTime), {
    path: ["endTime"],
    message: "End time must be after start time",
  })
  .refine((v) => Date.parse(v.endTime) > Date.now() + 60_000, { path: ["endTime"], message: "End time must be in the future" });

export type ElectionFormValues = z.infer<typeof electionFormSchema>;

export interface ElectionPayload {
  title: string;
  description: string;
  options: string[];
  startTime: string;
  endTime: string;
  quorumBps: number;
}

export function toPayload(v: ElectionFormValues): ElectionPayload {
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    options: v.options.map((o) => o.label.trim()),
    startTime: new Date(v.startTime).toISOString(),
    endTime: new Date(v.endTime).toISOString(),
    quorumBps: Math.round(v.quorumPercent * 100),
  };
}

export function defaultElectionValues(): ElectionFormValues {
  const start = new Date(); // current minute: voting starts as soon as the organizer opens it
  const end = new Date(Date.now() + 3 * 24 * 3600_000);
  return {
    title: "",
    description: "",
    options: [{ label: "Approve" }, { label: "Reject" }],
    startTime: toLocalInput(start),
    endTime: toLocalInput(end),
    quorumPercent: 50,
  };
}

export function ElectionForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: ElectionFormValues;
  submitLabel: string;
  onSubmit: (payload: ElectionPayload) => Promise<void>;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ElectionFormValues>({ resolver: zodResolver(electionFormSchema), defaultValues: initial });
  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toPayload(v)))} className="space-y-4" noValidate>
      <Field
        label="Title"
        htmlFor="title"
        error={errors.title?.message}
        hint="Public: stored on-chain. Do not include personal data."
      >
        <Input id="title" {...register("title")} aria-invalid={!!errors.title} />
      </Field>
      <Field
        label="Description"
        htmlFor="description"
        error={errors.description?.message}
        hint="Stored off-chain in the database."
      >
        <Textarea id="description" {...register("description")} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-300">Voting options (2–10, public on-chain)</legend>
        {fields.map((f, i) => (
          <div key={f.id} className="flex items-start gap-2">
            <div className="flex-1">
              <label htmlFor={`option-${i}`} className="sr-only">
                Option {i + 1}
              </label>
              <Input id={`option-${i}`} placeholder={`Option ${i + 1}`} {...register(`options.${i}.label` as const)} />
              {errors.options?.[i]?.label && <p className="mt-1 text-xs text-rose-300">{errors.options[i]?.label?.message}</p>}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(i)}
              disabled={fields.length <= 2}
              aria-label={`Remove option ${i + 1}`}
            >
              Remove
            </Button>
          </div>
        ))}
        {errors.options?.root?.message && (
          <p className="text-xs text-rose-300" role="alert">
            {errors.options.root.message}
          </p>
        )}
        {errors.options?.message && (
          <p className="text-xs text-rose-300" role="alert">
            {errors.options.message}
          </p>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={() => append({ label: "" })} disabled={fields.length >= 10}>
          Add option
        </Button>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Voting starts" htmlFor="startTime" error={errors.startTime?.message}>
          <Input id="startTime" type="datetime-local" {...register("startTime")} />
        </Field>
        <Field label="Voting ends" htmlFor="endTime" error={errors.endTime?.message}>
          <Input id="endTime" type="datetime-local" {...register("endTime")} />
        </Field>
        <Field label="Quorum (% of eligible weight)" htmlFor="quorum" error={errors.quorumPercent?.message}>
          <Input
            id="quorum"
            type="number"
            step="0.01"
            min={0}
            max={100}
            {...register("quorumPercent", { valueAsNumber: true })}
          />
        </Field>
      </div>
      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
