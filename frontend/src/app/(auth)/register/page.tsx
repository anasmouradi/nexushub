"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { UseFormRegisterReturn } from "react-hook-form";
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
  companyName: z.string().trim().min(2, "Nom de l’entreprise requis").max(120),
  firstName: z.string().trim().min(1, "Prénom requis").max(100),
  lastName: z.string().trim().min(1, "Nom requis").max(100),
  email: z.string().email("Email invalide").max(254),
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

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    try {
      await register(values);
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inscription impossible");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Créer votre espace NexusHub</CardTitle>
          <CardDescription>Votre entreprise, organisée au même endroit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormInput
              id="companyName"
              label="Entreprise"
              error={errors.companyName?.message}
              registration={registerField("companyName")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput
                id="firstName"
                label="Prénom"
                error={errors.firstName?.message}
                registration={registerField("firstName")}
                autoComplete="given-name"
              />
              <FormInput
                id="lastName"
                label="Nom"
                error={errors.lastName?.message}
                registration={registerField("lastName")}
                autoComplete="family-name"
              />
            </div>
            <FormInput
              id="email"
              label="Email"
              type="email"
              error={errors.email?.message}
              registration={registerField("email")}
              autoComplete="email"
            />
            <FormInput
              id="password"
              label="Mot de passe"
              type="password"
              error={errors.password?.message}
              registration={registerField("password")}
              autoComplete="new-password"
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Création…" : "Créer mon espace"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Déjà inscrit ?{" "}
              <Link href="/login" className="font-medium text-foreground underline">
                Se connecter
              </Link>
            </p>
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
  registration,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  error?: string;
  registration: UseFormRegisterReturn;
  autoComplete?: string;
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
