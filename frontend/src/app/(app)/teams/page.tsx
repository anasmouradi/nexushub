"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createTeam, getTeams } from "@/lib/teams";
import { useAuth } from "@/lib/auth";

const createTeamSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
  description: z.string().trim().max(500, "500 caractères maximum"),
});

type CreateTeamValues = z.infer<typeof createTeamSchema>;

function displayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

export default function TeamsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: getTeams,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTeamValues>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: "", description: "" },
  });

  const createMutation = useMutation({
    mutationFn: createTeam,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      setDialogOpen(false);
      reset();
      toast.success("Équipe créée");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    },
  });

  const onSubmit = (values: CreateTeamValues) => {
    createMutation.mutate({
      name: values.name,
      ...(values.description && { description: values.description }),
    });
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Équipes</h1>
          <p className="text-sm text-muted-foreground">
            Organisez les membres de votre entreprise en équipes.
          </p>
        </div>
        {user?.role === "COMPANY_ADMIN" && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            Nouvelle équipe
          </Button>
        )}
      </header>

      {teamsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement des équipes…</p>
      ) : teamsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {teamsQuery.error.message}
        </p>
      ) : teamsQuery.data.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune équipe pour le moment.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Équipe</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead className="text-right">Membres</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamsQuery.data.map((team) => (
                <TableRow key={team.id}>
                  <TableCell>
                    <Link
                      href={`/teams/${team.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {team.name}
                    </Link>
                    {team.description && (
                      <p className="mt-1 max-w-xl truncate text-xs text-muted-foreground">
                        {team.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {team.manager ? displayName(team.manager) : "Non assigné"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{team.membersCount}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle équipe</DialogTitle>
            <DialogDescription>
              Créez une équipe dans votre entreprise.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Nom</Label>
              <Input id="team-name" autoFocus {...register("name")} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-description">Description</Label>
              <textarea
                id="team-description"
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {createMutation.isPending ? "Création…" : "Créer l’équipe"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
