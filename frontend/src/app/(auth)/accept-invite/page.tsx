"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(100),
  lastName: z.string().trim().min(1, "Nom requis").max(100),
  password: z
    .string()
    .min(12, "12 caractères minimum")
    .max(128)
    .refine(
      (password) => new TextEncoder().encode(password).length <= 72,
      "Le mot de passe ne peut pas dépasser 72 octets UTF-8",
    ),
});
type Values = z.infer<typeof schema>;

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center p-4">
          <p>Chargement…</p>
        </main>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const { acceptInvite } = useAuth();
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    if (!token) {
      toast.error("Le lien d’invitation est invalide ou incomplet.");
      return;
    }

    try {
      await acceptInvite({ token, ...values });
      toast.success("Votre compte est créé. Vous pouvez vous connecter.");
      router.replace("/login");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d’accepter l’invitation",
      );
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Rejoindre NexusHub</CardTitle>
          <CardDescription>
            Créez votre profil pour rejoindre votre entreprise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormInput
              id="firstName"
              label="Prénom"
              autoComplete="given-name"
              error={errors.firstName?.message}
              {...register("firstName")}
            />
            <FormInput
              id="lastName"
              label="Nom"
              autoComplete="family-name"
              error={errors.lastName?.message}
              {...register("lastName")}
            />
            <FormInput
              id="password"
              label="Mot de passe"
              type="password"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register("password")}
            />
            {!token && (
              <p role="alert" className="text-sm text-destructive">
                Le lien d’invitation ne contient pas de jeton.
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !token}
            >
              {isSubmitting ? "Création du compte…" : "Accepter l’invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function FormInput({
  id,
  label,
  type = "text",
  error,
  autoComplete,
  ...registration
}: React.ComponentProps<typeof Input> & {
  id: string;
  label: string;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        {...registration}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
