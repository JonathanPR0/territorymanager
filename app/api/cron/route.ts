import { isBefore, subDays } from "date-fns";
import { NextResponse } from "next/server";
import connectToDB from "../lib/mongoose";
import Territory from "../models/territory.model";
import TerritoryLog from "../models/territoryLog.model";

export async function GET(req: Request) {
  // Verifica a autorização do header
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDB();

    const thresholdDays = parseInt(process.env.TERRITORY_LOG_THRESHOLD_DAYS || "365", 10);
    const thresholdDate = subDays(new Date(), thresholdDays);

    // Buscar todos os territórios "done" de uma vez
    const outdatedTerritories = await Territory.find({ status: "done" }).lean();

    // Buscar todos os logs de territórios relevantes em uma única query
    const logs = await TerritoryLog.find({
      id_territory: { $in: outdatedTerritories.map((t) => t._id) },
    })
      .sort({ date: -1 }) // Ordena por data decrescente
      .lean();

    // Criar um Map para acessar o último log de cada território rapidamente
    const lastLogsMap = new Map();
    logs.forEach((log) => {
      if (!lastLogsMap.has(String(log.territory))) {
        lastLogsMap.set(String(log.territory), log);
      }
    });

    // Filtrar territórios que precisam ser atualizados
    const territoriesToUpdate = outdatedTerritories
      .filter((territory) => {
        const lastLog = lastLogsMap.get(String(territory._id));
        return !lastLog || isBefore(new Date(lastLog.date), thresholdDate);
      })
      .map((territory) => territory._id);

    // Atualizar apenas os necessários
    if (territoriesToUpdate.length > 0) {
      await Territory.updateMany(
        { _id: { $in: territoriesToUpdate } },
        { $set: { status: "urgent" } },
      );
    }

    return NextResponse.json({
      message: "Cron job executada com sucesso",
      updatedCount: territoriesToUpdate.length,
    });
  } catch (error: any) {
    console.error("Erro na cron job:", error.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
