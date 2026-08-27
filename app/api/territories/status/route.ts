import { withAuth } from "@/app/api/lib/auth";
import connectToDB from "@/app/api/lib/mongoose";
import Territory from "@/app/api/models/territory.model";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import TerritoryLog from "../../models/territoryLog.model";

export async function GET(req: Request) {
  const user = await withAuth(req);
  if (user instanceof NextResponse) return user;

  try {
    await connectToDB();

    // Faz o count agrupando por status
    const statusCounts = await Territory.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Converte para um objeto mais legível
    const statusSummary: Record<string, number> = {};
    statusCounts.forEach(({ _id, count }) => {
      statusSummary[_id] = count;
    });

    return NextResponse.json({ ...statusSummary }, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao buscar territórios:", error.message);
    return NextResponse.json({ error: "Erro ao buscar territórios" }, { status: 500 });
  }
}

// Atualizar status de um território (PUT)
export async function PUT(req: NextRequest) {
  const user = await withAuth(req);
  if (user instanceof NextResponse) return user;
  try {
    await connectToDB();
    let { id, status, id_responsible, data } = await req.json();

    if (!mongoose.models.Group) {
      await import("@/app/api/models/group.model");
    }
    if (!mongoose.models.Neighborhood) {
      await import("@/app/api/models/neighborhood.model");
    }

    // Primeiro, busque o território atual para verificar o status antes da atualização
    const currentTerritory = await Territory.findById(id);
    if (!currentTerritory) {
      throw new Error("Território não encontrado");
    }

    // Verifique se o status atual é "ongoing" e o novo status é "assigned" para evitar a mudança
    if (currentTerritory.status === "ongoing" && status === "assigned") {
      status = currentTerritory.status; // Mantém o status atual (ongoing)
    }

    const updateFields: any = { status };
    // Verifique se o status atual é "done" ou "urgent" e o novo status é "assigned" para resetar o doneSquaresList
    if (
      (currentTerritory.status === "done" || currentTerritory.status === "urgent") &&
      status === "assigned"
    ) {
      updateFields.doneSquaresList = [];
    }

    // Se for "assigned", adiciona o responsável no array (sem duplicação)
    if (id_responsible) {
      updateFields.$addToSet = { responsibles: id_responsible };
    }

    // Se for "done", esvazia o array de responsáveis
    if (status === "done" || status === "urgent") {
      updateFields.responsibles = [];
    }

    const updatedTerritory = await Territory.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    })
      .populate("id_group")
      .populate("id_neighborhood");

    if (!updatedTerritory) throw new Error("Território não encontrado");

    // Se o status for "done" ou "ongoing", cria um registro na tabela TerritoryLog
    if (status === "done" || status === "ongoing") {
      await TerritoryLog.create({
        territory: id,
        user: user.id, // Pegando o ID do usuário autenticado
        data: data || new Date(),
        status,
        information: "Território finalizado",
      });
    }

    return NextResponse.json(updatedTerritory, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao atualizar status do território:", error.message);
    return NextResponse.json({ error: error.message, details: error }, { status: 400 });
  }
}
