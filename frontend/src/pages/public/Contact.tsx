import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import { ContentShell, ContentSection } from "@/components/ContentShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().min(2, "Enter your full name").max(120),
  email: z.string().email("Enter a valid email address"),
  subject: z.string().min(3, "Enter a subject").max(160),
  message: z.string().min(10, "Message must be at least 10 characters").max(4000),
});
type FormValues = z.infer<typeof schema>;

export default function Contact() {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", subject: "", message: "" } });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => apiPost<{ ok: boolean }>("/contact", values),
    onSuccess: () => {
      toast.success("Message received", {
        description: "Delivered to the console email provider in this sandbox.",
      });
      form.reset();
    },
    onError: (error) => {
      const detail = error instanceof ApiError && error.body && typeof error.body === "object"
        ? (error.body as { detail?: string }).detail
        : undefined;
      toast.error(detail ?? "Your message could not be sent. Please retry shortly.");
    },
  });

  return (
    <ContentShell
      title="Contact the commission"
      lede="Questions about the sandbox build, security review, or the project scope."
      testid="contact-page"
    >
      <ContentSection title="Send a message">
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values))}
          data-testid="contact-form"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-name">Full name</Label>
            <Input id="contact-name" placeholder="Your name" {...form.register("name")} data-testid="contact-name-input" />
            {form.formState.errors.name && (
              <p className="text-xs font-medium text-destructive" role="alert">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" type="email" placeholder="you@example.com" {...form.register("email")} data-testid="contact-email-input" />
            {form.formState.errors.email && (
              <p className="text-xs font-medium text-destructive" role="alert">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-subject">Subject</Label>
            <Input id="contact-subject" placeholder="Subject" {...form.register("subject")} data-testid="contact-subject-input" />
            {form.formState.errors.subject && (
              <p className="text-xs font-medium text-destructive" role="alert">{form.formState.errors.subject.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-message">Message</Label>
            <Textarea id="contact-message" rows={5} placeholder="Your message…" {...form.register("message")} data-testid="contact-message-input" />
            {form.formState.errors.message && (
              <p className="text-xs font-medium text-destructive" role="alert">{form.formState.errors.message.message}</p>
            )}
          </div>
          <Button type="submit" disabled={mutation.isPending} className="w-fit" data-testid="contact-submit-button">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Send message
          </Button>
        </form>
      </ContentSection>
    </ContentShell>
  );
}
