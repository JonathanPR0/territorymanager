"use client";
import AlertRemoveSquare from "@/components/custom/AlertRemoveSquare";
import { ToggleMapMode } from "@/components/custom/ToggleMapMode";
import { Button } from "@/components/ui/button";
import { useSquares } from "@/hooks/useSquares";
import { useTerritories } from "@/hooks/useTerritories";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import * as turf from "@turf/turf";
import { AlertTriangle, ChevronLeft, CircleCheck, Hash, Layers } from "lucide-react";
import mapboxgl, { Map } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStoreTerritory } from "../../stores/store";
import ButtonDoneSquare from "./ButtonDoneSquare";
import SquareSideInfo from "./SquareSideInfo";
import TerritorySideInfo from "./TerritorySideInfo";

export type SquareListProps = {
  id: string;
  label: string;
  canToggle: boolean;
};
// Defina a chave de acesso do Mapbox
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_APP_TOKEN;
mapboxgl.accessToken = TOKEN;

const DEFAULT_STATUS_EMOJI = "❔";
const STATUS_CONFIG: Record<string, { color: string; label: string; emoji: string }> = {
  done: { color: "#22c55e", label: "Concluído", emoji: "✅" },
  assigned: { color: "#3b82f6", label: "Designado", emoji: "ℹ️" },
  ongoing: { color: "#f59e0b", label: "Em andamento", emoji: "☑️" },
  urgent: { color: "#ef4444", label: "Urgente", emoji: "⚠️" },
};

const DEFAULT_STATUS_COLOR = "#9ca3af";

const statusColorExpression = [
  "match",
  ["get", "status"],
  "done",
  STATUS_CONFIG.done.color,
  "assigned",
  STATUS_CONFIG.assigned.color,
  "ongoing",
  STATUS_CONFIG.ongoing.color,
  "urgent",
  STATUS_CONFIG.urgent.color,
  DEFAULT_STATUS_COLOR,
] as unknown as mapboxgl.Expression;

const statusEmojiExpression = [
  "match",
  ["get", "status"],
  "done",
  STATUS_CONFIG.done.emoji,
  "assigned",
  STATUS_CONFIG.assigned.emoji,
  "ongoing",
  STATUS_CONFIG.ongoing.emoji,
  "urgent",
  STATUS_CONFIG.urgent.emoji,
  DEFAULT_STATUS_EMOJI,
] as unknown as mapboxgl.Expression;

function MapWithDraw({ canEdit }: { canEdit: boolean }) {
  const searchParams = useSearchParams();
  const number = searchParams.get("number");

  //~ HOOK DE CONSULTA DE TERRITÓRIOS
  const showSquares = +canEdit || +!!number;
  const {
    data: territories,
    isSuccess,
    isPending,
  } = useTerritories().getAll({ filters: { number, showSquares } });
  const { data: orphansSquares } = useSquares().getOrphans({ enabled: !!canEdit });
  const { mutate: doneSquares } = useTerritories().doneSquares();

  //~ DADOS/FUNÇÕES STORE
  const openSideInfo = useStoreTerritory().openSideInfo;
  const openAlertRemoveSquare = useStoreTerritory().openAlertRemoveSquare;

  const mapStyle = useStoreTerritory().mapStyle;
  const toggleMapStyle = useStoreTerritory().toggleMapStyle;

  const mode = useStoreTerritory().mode;
  const toggleMode = useStoreTerritory().toggleMode;

  //~ STATES
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [squareList, setSquareList] = useState<SquareListProps[]>([]);
  const [labelMode, setLabelMode] = useState<"number" | "status">("number");

  //& EFFECT DE CLIENTE
  useEffect(() => {
    setIsClient(true); // Definir como true quando o componente for renderizado no cliente
  }, []);

  //& EFFECT DE INICIALIZAÇÃO DO MAPBOX
  useEffect(() => {
    if (map.current) return; // Evita recriar o mapa

    map.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: mapStyle,
      center: [-35.2628, -5.9156],
      zoom: 12.5,
    });

    //* CONTROLES DO MAPA
    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: canEdit },
    });
    map.current.addControl(draw.current);
    map.current.addControl(new mapboxgl.FullscreenControl({ container: mapContainer.current }));

    //* GEOLOCATE CONTROL
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
    });

    map.current.addControl(geolocate);

    //* PRIMEIRO CARREGAMENTO DOS TERRITÓRIOS
    map.current.on("load", () => {
      // geolocate.trigger();
      loadTerritories();
    });

    //* DESABILITA DOUBBLE CLICK ZOOM
    map.current.doubleClickZoom.disable();

    //* EVENTO DE CRIAÇÃO DE POLÍGONO
    map.current.on("draw.create", (e: { features: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const { features } = e;
      if (features.length > 0) {
        if (features[0].geometry.type === "Polygon") {
          const coordinates = features[0].geometry.coordinates as [number, number][][];

          if (coordinates) {
            openSideInfo({ id: "", coordinates });
          }
        }
      }
    });
  }, []);

  //& ATUALIZAÇÃO DE ESTILO
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const statusMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const map = useRef<Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  useEffect(() => {
    if (!map.current) return;
    setStyleLoaded(false);
    setTimeout(() => {
      map.current?.setStyle(mapStyle);
    }, 100);

    map.current.once("style.load", () => {
      loadTerritories();
      setStyleLoaded(true);
    });
  }, [isClient, mapStyle]);

  //& FUNÇÕES DOS TERRITÓRIOS E DAS QUADRAS
  const handleTerritoryClick = useCallback(
    (e: any) => {
      if (!e.features || e.features.length === 0) return;
      const id = e.features[0].properties?.id;
      openSideInfo({ id, mode: "territory" });
    },
    [openSideInfo],
  );
  const lastTapRef = useRef(0);

  const handleTouchEndTerritory = useCallback(
    (e: any) => {
      // Verificação mais robusta para multi-touch
      if (
        (e.originalEvent.touches && e.originalEvent.touches.length > 0) ||
        (e.originalEvent.changedTouches && e.originalEvent.changedTouches.length > 1)
      ) {
        // console.log("Multi-touch detectado, ignorando");
        return; // Ignora multi-touches (pinch zoom, pan com vários dedos, etc)
      }

      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapRef.current;

      if (tapLength < 300 && tapLength > 0) {
        handleTerritoryClick(e);
      }

      lastTapRef.current = currentTime;
    },
    [handleTerritoryClick],
  );

  // Função para limpar os event listeners de território
  const cleanupTerritoryListeners = useCallback(() => {
    if (map.current) {
      // console.log("Limpando event listeners de território");

      // Remover todos os event listeners associados ao território
      if (map.current.getLayer("territories-fill")) {
        map.current.off("dblclick", "territories-fill", handleTerritoryClick);
        map.current.off("touchend", "territories-fill", handleTouchEndTerritory);
      }
    }
  }, [handleTerritoryClick, handleTouchEndTerritory]);

  const handleSquareClick = useCallback(
    (e: any) => {
      if (!e || !e.features || e.features.length === 0 || !e.features[0]?.properties) {
        return;
      }

      const id = e.features[0].properties?.id;

      if (number) {
        const label = e.features[0].properties?.number;
        setSquareList((prev) => {
          const existingSquare = prev.find((sq) => sq.id === id);
          if (existingSquare) {
            return existingSquare.canToggle ? prev.filter((sq) => sq.id !== id) : prev;
          }
          return [...prev, { id, canToggle: true, label }];
        });
      } else {
        openSideInfo({ id, mode: "square" });
      }
    },
    [number],
  );

  const handleRemoveSquare = useCallback(
    (e: any) => {
      if (!e.features || e.features.length === 0) return;
      const id = e.features[0].properties?.id;
      openAlertRemoveSquare(id);
    },
    [openAlertRemoveSquare],
  );

  //* --------------- QUADRAS ---------------
  const createSquares = useCallback(
    ({
      squares,
      color,
      id,
      number,
      doneSquaresList,
    }: {
      squares: any[];
      color: string;
      id: string;
      number: string;
      doneSquaresList: string[];
    }) => {
      if (!map.current || !squares.length) return;

      // Criar fontes para cada território
      const squaresSourceId = `squares-${id}`;
      const squaresLabelsSourceId = `squares-labels-${id}`;
      const squaresFillId = `squares-fill-${id}`;
      const squaresOutlineId = `squares-outline-${id}`;
      const squaresNumberId = `squares-number-${id}`;

      // Removendo layers e sources existentes
      const layersToRemove = [squaresFillId, squaresOutlineId, squaresNumberId];
      layersToRemove.forEach((layer) => {
        if (map.current!.getLayer(layer)) {
          map.current!.removeLayer(layer);
        }
      });

      const sourcesToRemove = [squaresSourceId, squaresLabelsSourceId];
      sourcesToRemove.forEach((source) => {
        if (map.current!.getSource(source)) {
          map.current!.removeSource(source);
        }
      });

      // Adicionar o source de squares para o território
      map.current.addSource(squaresSourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: squares.map((square) => ({
            type: "Feature",
            properties: {
              id: square._id,
              color: color,
              number: `${number}${square.letter}`,
            },
            geometry: {
              type: "Polygon",
              coordinates: square.coordinates || [],
            },
          })),
        },
      });

      // Adicionar o source de labels para os squares do território
      map.current.addSource(squaresLabelsSourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: squares.map((square) => {
            const center = turf.centroid({
              type: "Feature",
              properties: {},
              geometry: { type: "Polygon", coordinates: square?.coordinates || [] },
            }).geometry.coordinates;

            return {
              type: "Feature",
              properties: {
                number: `${number}${square.letter}` || "",
                color: color || "",
              },
              geometry: { type: "Point", coordinates: center },
            };
          }),
        },
      });

      // Adicionar a camada de preenchimento das quadras para o território
      map.current.addLayer({
        id: squaresFillId,
        type: "fill",
        source: squaresSourceId,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": [
            "step",
            ["to-number", ["in", ["get", "id"], ["literal", squareList.map((sq) => sq.id)]]],
            0.2,
            1,
            0.8,
          ],
        },
      });

      if (number && !canEdit) {
        if (doneSquaresList && map.current!.getLayer(squaresFillId)) {
          map.current.setPaintProperty(squaresFillId, "fill-opacity", [
            "step",
            ["to-number", ["in", ["get", "id"], ["literal", doneSquaresList]]],
            0.2,
            1,
            0.8,
          ]);
        }
      }

      // Adicionar a camada das bordas dos squares para o território
      map.current.addLayer({
        id: squaresOutlineId,
        type: "line",
        source: squaresSourceId,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
        },
      });

      // Adicionar a camada de números dos squares
      map.current.addLayer({
        id: squaresNumberId,
        type: "symbol",
        source: squaresLabelsSourceId,
        layout: {
          "text-field": ["get", "number"],
          "text-size": 18,
          "text-font": ["Open Sans Bold"],
          "text-anchor": "center",
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": "#fefefe",
          "text-halo-width": 1,
        },
      });

      map.current.off("click", squaresFillId, handleSquareClick);
      map.current.off("touchend", squaresFillId, handleSquareClick);
      map.current.off("dblclick", squaresFillId, handleRemoveSquare);
      // Mudar cursor ao passar sobre os polígonos
      map.current.on("mouseenter", squaresFillId, () => {
        map.current!.getCanvas().style.cursor = "pointer";
      });

      map.current.on("mouseleave", squaresFillId, () => {
        map.current!.getCanvas().style.cursor = "";
      });

      // Eventos nas quadras
      if (number) {
        map.current.on("click", squaresFillId, handleSquareClick);
        map.current.on("touchend", squaresFillId, handleSquareClick);
      } else if (canEdit) {
        // Eventos de remoção das quadras
        map.current.on("dblclick", squaresFillId, handleRemoveSquare);
      }
    },
    [
      map,
      handleSquareClick,
      handleRemoveSquare,
      squareList,
      canEdit,
      territories,
      styleLoaded,
      isClient,
      isSuccess,
      isPending,
      mode,
    ],
  );

  //& FUNÇÃO DE CARREGAR QUADRAS
  const loadTerritoriesSquares = useCallback(() => {
    if (!map.current || !territories?.length || !territories[0] || !styleLoaded || !isClient)
      return;

    territories.forEach((territory) => {
      const squares = territory.squares;
      if (!squares || !squares.length || !map.current) return;

      createSquares({
        squares,
        color: territory?.group?.color || "",
        id: territory._id || "",
        number: territory.number,
        doneSquaresList: territory.doneSquaresList || [],
      });
    });

    orphansSquares?.length &&
      createSquares({
        squares: orphansSquares,
        id: "orphans",
        number: "ORFÃO",
        color: "#C5C5C5",
        doneSquaresList: [],
      });
  }, [
    territories,
    styleLoaded,
    isClient,
    isSuccess,
    isPending,
    mode,
    orphansSquares,
    createSquares,
  ]);

  //& ATUALIZAÇÃO DA OPACITY DAS QUADRAS
  const opacity = useMemo(() => {
    return [
      "step",
      [
        "to-number",
        ["in", ["get", "id"], ["literal", canEdit ? [] : squareList.map((sq) => sq.id)]],
      ],
      0.2,
      1,
      0.8,
    ];
  }, [squareList, canEdit]);

  useEffect(() => {
    if (map.current && styleLoaded) {
      territories?.forEach((t) => {
        const squaresFillId = `squares-fill-${t._id}`;

        if (map.current!.getLayer(squaresFillId)) {
          //@ts-ignore
          map.current.setPaintProperty(squaresFillId, "fill-opacity", opacity);
        }
      });
    }
  }, [opacity, styleLoaded, mode, territories]);

  useEffect(() => {
    if (number && territories && territories[0] && territories[0].doneSquaresList && styleLoaded) {
      const doneSquaresList = territories[0]?.doneSquaresList;
      setSquareList(doneSquaresList.map((id) => ({ id, canToggle: false, label: "" })));
    }
  }, [territories, number, styleLoaded]);

  //* -----------------------------------------

  //* -------------- STATUS MARKERS ---------------

  //& MARCADORES
  const clearStatusMarkers = useCallback(() => {
    statusMarkersRef.current.forEach((marker) => marker.remove());
    statusMarkersRef.current = [];
  }, []);
  const renderStatusMarkers = useCallback(() => {
    clearStatusMarkers();

    if (!map.current || !territories?.length) return;

    // Só mostra o status quando estamos vendo só o território (sem quadras)
    const onlyTerritoryView = !showSquares || (canEdit && mode === "territory");
    if (!onlyTerritoryView || labelMode !== "status") return;

    territories.forEach((territorio) => {
      if (!territorio?.coordinates) return;

      const center = turf.centroid({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: territorio.coordinates },
      }).geometry.coordinates as [number, number];

      const emoji = STATUS_CONFIG[territorio?.status ?? ""]?.emoji ?? DEFAULT_STATUS_EMOJI;

      const el = document.createElement("div");
      el.style.fontSize = "18px";
      el.style.lineHeight = "1";
      el.style.transform = "translate(28px, 0px)"; // só desloca para o lado, mesma altura do número
      el.style.pointerEvents = "none";
      el.textContent = emoji;

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(center)
        .addTo(map.current!);

      statusMarkersRef.current.push(marker);
    });
  }, [territories, showSquares, canEdit, mode, labelMode, clearStatusMarkers]);
  useEffect(() => {
    if (styleLoaded && isClient) {
      renderStatusMarkers();
    }
  }, [mode, showSquares, labelMode, styleLoaded, isClient, renderStatusMarkers]);
  //* -------------------------------------------

  //* --------------- TERRITÓRIOS ---------------
  //& FUNÇÃO DE CARREGAR TERRITÓRIOS
  async function loadTerritories() {
    if (!map.current || !territories?.length || !territories[0] || !styleLoaded || !isClient)
      return;

    setTimeout(() => {
      if (!map.current) return;

      // Primeiro, limpe os event listeners existentes
      cleanupTerritoryListeners();

      // TERRITORIES
      // Removendo layers e sources existentes
      const layersToRemove = ["territories-fill", "territories-outline", "territories-number"];
      layersToRemove.forEach((layer) => {
        if (map.current!.getLayer(layer)) {
          map.current!.removeLayer(layer);
        }
      });

      const sourcesToRemove = ["territories", "territories-labels", "squares", "squares-labels"];
      sourcesToRemove.forEach((source) => {
        if (map.current!.getSource(source)) {
          map.current!.removeSource(source);
        }
      });

      //SQUARES
      territories.forEach((territory) => {
        const squaresSourceId = `squares-${territory._id}`;
        const squaresLabelsSourceId = `squares-labels-${territory._id}`;
        const squaresFillId = `squares-fill-${territory._id}`;
        const squaresOutlineId = `squares-outline-${territory._id}`;
        const squaresNumberId = `squares-number-${territory._id}`;
        // Removendo layers e sources existentes
        const layersToRemove = [squaresFillId, squaresOutlineId, squaresNumberId];
        layersToRemove.forEach((layer) => {
          if (map.current!.getLayer(layer)) {
            map.current!.removeLayer(layer);
          }
        });

        const sourcesToRemove = [squaresSourceId, squaresLabelsSourceId];
        sourcesToRemove.forEach((source) => {
          if (map.current!.getSource(source)) {
            map.current!.removeSource(source);
          }
        });
      });

      // ACTIONS
      if (map.current.getLayer("territories-fill")) {
        map.current.off("dblclick", "territories-fill", handleTerritoryClick);
        map.current.off("touchend", "territories-fill", handleTouchEndTerritory);
      }

      map.current.addSource("territories", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: territories.map((poligono) => ({
            type: "Feature",
            properties: {
              id: poligono?._id,
              color: poligono?.group?.color,
              status: poligono?.status,
              number: poligono?.number,
            },
            geometry: {
              type: "Polygon",
              coordinates: poligono?.coordinates || [],
            },
          })),
        },
      });

      // Adicionar camada dos polígonos
      map.current.addLayer({
        id: "territories-fill",
        type: "fill",
        source: "territories",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.2,
        },
      });

      // Adicionar camada das bordas dos polígonos
      map.current.addLayer({
        id: "territories-outline",
        type: "line",
        source: "territories",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
        },
      });

      const onlyTerritoryView = !showSquares || (canEdit && mode === "territory");

      // Criar um novo source para os números (centro dos territórios)
      if (onlyTerritoryView) {
        map.current.addSource("territories-labels", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: territories.map((poligono) => {
              const center = turf.centroid({
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Polygon",
                  coordinates: poligono?.coordinates || [],
                },
              }).geometry.coordinates;

              return {
                type: "Feature",
                properties: {
                  number: poligono?.number || "",
                  color: poligono?.group?.color || "",
                },
                geometry: {
                  type: "Point",
                  coordinates: center,
                },
              };
            }),
          },
        });
        if (labelMode === "number") {
          // Adicionar camada para os números no centro dos territórios
          map.current.addLayer({
            id: "territories-number",
            type: "symbol",
            source: "territories-labels",
            layout: {
              "text-field": ["get", "number"], // Exibe o número do number
              "text-size": 18,
              "text-font": ["Open Sans Bold"], // Usa a versão bold da fonte
              "text-anchor": "center",
            },
            paint: {
              "text-color": ["get", "color"], // Cor do número
              "text-halo-color": "#fefefe", // Borda branca para melhorar a visibilidade
              "text-halo-width": 1,
            },
          });
        }
        // Mudar cursor ao passar sobre os polígonos
        // Primeiro removemos todos os listeners existentes
        map.current.off("dblclick", "territories-fill", handleTerritoryClick);
        map.current.off("touchend", "territories-fill", handleTouchEndTerritory);

        // Verificação do modo para determinar se deve adicionar event listeners
        if (mode === "territory") {
          // console.log("Adicionando listeners de território");

          map.current.on("mouseenter", "territories-fill", () => {
            map.current!.getCanvas().style.cursor = "pointer";
          });

          map.current.on("mouseleave", "territories-fill", () => {
            map.current!.getCanvas().style.cursor = "";
          });

          map.current.on("dblclick", "territories-fill", handleTerritoryClick);
          map.current.on("touchend", "territories-fill", handleTouchEndTerritory);
        } else {
          // Se não estiver no modo território, configurar cursor padrão
          map.current.on("mouseenter", "territories-fill", () => {
            map.current!.getCanvas().style.cursor = "default";
          });
          map.current.on("mouseleave", "territories-fill", () => {
            map.current!.getCanvas().style.cursor = "default";
          });
        }
      } else {
        // Se não mostrar territórios ou estiver no modo quadrado, cursor padrão
        map.current.on("mouseenter", "territories-fill", () => {
          map.current!.getCanvas().style.cursor = "default";
        });
        map.current.on("mouseleave", "territories-fill", () => {
          map.current!.getCanvas().style.cursor = "default";
        });
      }

      if (canEdit ? showSquares && mode === "square" : showSquares) {
        loadTerritoriesSquares();
      }

      if (territories.length > 0 && !!territories[0]) {
        const bounds = new mapboxgl.LngLatBounds();

        territories.forEach((territory) => {
          // Flatten para obter apenas os pontos individuais
          const coordinates = territory?.coordinates.flat(1); // Achata até o nível dos pontos

          coordinates?.forEach((coord) => {
            if (Array.isArray(coord) && coord.length === 2) {
              bounds.extend(coord as unknown as [number, number]); // Extende o bounds com o ponto
            }
          });
        });

        map.current.fitBounds(bounds, {
          padding: 40,
          maxZoom: number ? 18 : 16,
          duration: 1000,
        });

        renderStatusMarkers(); // Renderiza os marcadores de status após ajustar os limites do mapa
      }
    }, 350);
  }

  //& ATUALIZAÇÃO DE TERRITÓRIOS QUANDO CHEGAM NOVOS DADOS
  useEffect(() => {
    if (territories && territories.length > 0 && territories[0] && isSuccess) {
      loadTerritories();
    }

    return () => {
      cleanupTerritoryListeners();
      clearStatusMarkers();
    };
  }, [
    territories,
    territories && territories[0],
    orphansSquares,
    styleLoaded,
    isClient,
    isSuccess,
    isPending,
    mode,
    labelMode,
    cleanupTerritoryListeners,
    clearStatusMarkers,
  ]);

  //* -------------------------------------------

  const deleteSelectedPolygon = () => {
    if (draw.current) {
      const selectedFeatures = draw.current.getSelected();
      if (selectedFeatures.features.length > 0) {
        const featureId = selectedFeatures.features[0].id;
        if (featureId) {
          draw.current.delete(String(featureId));
        }
      }
    }
  };

  return (
    <div className="flex justify-center items-center flex-wrap">
      <div ref={mapContainer} className="rounded-md max-w-6xl h-[calc(100dvh-11rem)] w-full">
        <Button
          onClick={() => {
            toggleMapStyle();
          }}
          size={"sm"}
          variant={"secondary"}
          className="aspect-square rounded-full w-10 h-10"
          style={{ position: "absolute", top: "10px", left: "10px", zIndex: 1 }}
        >
          <Layers size={16} />
        </Button>
        {number && (
          <>
            <ButtonDoneSquare
              size={"lg"}
              variant={"success"}
              className={`aspect-square rounded-full button-slide-in ${
                squareList?.filter((sq) => sq.canToggle).length ? "visible" : ""
              }`}
              style={{ position: "absolute", bottom: "70px", right: "10px", zIndex: 1 }}
              title="Concluido"
              headerTitle="Dia que as quadras foram concluídas"
              description="As quadras selecionadas serão marcadas como concluídas"
              action={({ date, information }) =>
                doneSquares({
                  id: (territories && territories[0]._id) || "",
                  square_list: squareList,
                  data: date,
                  information,
                })
              }
            >
              <CircleCheck size={25} />
            </ButtonDoneSquare>

            <Button
              onClick={() => {
                openSideInfo({ id: (territories && territories[0]._id) || "", mode: "territory" });
              }}
              size={"lg"}
              variant={"secondary"}
              className="aspect-square rounded-full"
              style={{ position: "absolute", bottom: "20px", right: "10px", zIndex: 1 }}
            >
              <ChevronLeft size={25} />
            </Button>
          </>
        )}
        {canEdit && <ToggleMapMode mode={mode} toggleMode={toggleMode} />}
        {(!showSquares || (canEdit && mode === "territory")) && (
          <Button
            onClick={() => setLabelMode((prev) => (prev === "number" ? "status" : "number"))}
            size={"sm"}
            variant={"secondary"}
            className="aspect-square rounded-full w-10 h-10"
            style={{ position: "absolute", top: "10px", left: "60px", zIndex: 1 }}
            title={labelMode === "number" ? "Mostrar status" : "Mostrar número"}
          >
            {labelMode === "number" ? <AlertTriangle size={18} /> : <Hash size={18} />}
          </Button>
        )}
      </div>
      <TerritorySideInfo removeFeature={deleteSelectedPolygon} editing={canEdit} />
      <SquareSideInfo removeFeature={deleteSelectedPolygon} editing={canEdit} />
      <AlertRemoveSquare />
    </div>
  );
}
const Page = ({ canEdit }: { canEdit: boolean }) => {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <MapWithDraw canEdit={canEdit} />
    </Suspense>
  );
};
export default Page;
