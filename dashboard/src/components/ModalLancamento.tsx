import React, { useState, useEffect } from 'react';
import {
    ArrowDownCircle,
    ArrowUpCircle,
    TrendingUp,
    TrendingDown,
    CircleDollarSign,
    DollarSign,
    FileText,
    Calendar,
    X,
    Trash2
} from "lucide-react";

import "./ModalLancamento.css";

const BANDEIRAS: Record<string, React.ReactNode> = {
    BRL: (
        <svg viewBox="0 0 20 14" style={{ width: "20px", height: "14px" }}>
            <rect width="20" height="14" rx="1" fill="#009c3b" />
            <path d="M10 1L19 7L10 13L1 7L10 1Z" fill="#ffdf00" />
            <circle cx="10" cy="7" r="2.5" fill="#002776" />
        </svg>
    ),
    USD: (
        <svg viewBox="0 0 20 14" style={{ width: "20px", height: "14px" }}>
            <rect width="20" height="14" rx="1" fill="#1b1b2f" />
            <rect width="20" height="1" fill="#b22234" />
            <rect y="2" width="20" height="1" fill="#b22234" />
            <rect y="4" width="20" height="1" fill="#b22234" />
            <rect y="6" width="20" height="1" fill="#b22234" />
            <rect y="8" width="20" height="1" fill="#b22234" />
            <rect y="10" width="20" height="1" fill="#b22234" />
            <rect y="12" width="20" height="1" fill="#b22234" />
            <rect width="9" height="8" fill="#3c3b6e" />
        </svg>
    ),
    EUR: (
        <svg viewBox="0 0 20 14" style={{ width: "20px", height: "14px" }}>
            <rect width="20" height="14" rx="1" fill="#003399" />
            <circle
                cx="10"
                cy="7"
                r="3"
                fill="none"
                stroke="#ffcc00"
                strokeWidth="0.6"
                strokeDasharray="0.5 1"
            />
        </svg>
    )
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    username?: string;
    onSave: (payload: any) => void;
    perfisDisponiveis?: string[];

    // NOVO
    lancamento?: any;
    onDelete?: (id: any, grupoRateio?: string) => void;
}

export default function ModalLancamento({
    isOpen,
    onClose,
    username,
    onSave,
    perfisDisponiveis,
    lancamento,
    onDelete
}: Props) {

    const dadosIniciais = (tipo: "recebido" | "despesa") => ({
        id: null,
        tipo,
        data_lancamento: new Date().toISOString().substring(0,10),
        valor_original: 0,
        moeda: "BRL",
        taxa_conversao: 1,
        descricao: "",
        grupo_rateio: undefined as string | undefined
    });
    const [dados, setDados] = useState(() => dadosIniciais("recebido"));

    useEffect(() => {

        if (!isOpen) return;

        const tipoInicial = lancamento?.tipo ?? "recebido";

        if (lancamento) {

            setDados({
                ...dadosIniciais(tipoInicial),
                ...lancamento
            });

        } else {

            setDados(dadosIniciais(tipoInicial));

        }

    }, [isOpen, lancamento]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const valorBrl =
        dados.moeda === "BRL"
            ? Number(dados.valor_original)
            : Number(dados.valor_original) * Number(dados.taxa_conversao);

    return (

        <div 
            className="modal-overlay" 
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >

            <div className="modal-content">

                <div className="modal-header">

                    <div
                        className={`modal-icon ${
                            dados.tipo === "recebido"
                                ? "receita"
                                : "despesa"
                        }`}
                    >
                        <CircleDollarSign size={36} strokeWidth={2.2} />
                    </div>

                    <div style={{ flex: 1 }}>

                        <div className="modal-title-row">

                            <h2>

                                {lancamento
                                    ? dados.tipo === "recebido"
                                        ? "Editar Receita"
                                        : "Editar Despesa"
                                    : dados.tipo === "recebido"
                                        ? "Nova Receita"
                                        : "Nova Despesa"}

                                {username && ` para @${username}`}

                            </h2>

                        </div>

                        <p className="modal-subtitle">

                            {lancamento
                                ? "Edite as informações deste lançamento."
                                : dados.tipo === "recebido"
                                    ? "Registrar uma nova entrada financeira."
                                    : "Registrar uma nova saída financeira."}

                        </p>

                    </div>

                    <button
                        className="btn-close"
                        onClick={onClose}
                    >
                        <X size={20} />
                    </button>

                </div>

                <div className="modal-body">

                    <div className="modal-grid">

                        <div className="form-group full-width">

                            <div className="type-toggle">

                                <button
                                    className={`btn-toggle ${
                                        dados.tipo === "despesa"
                                            ? "active despesa"
                                            : ""
                                    }`}
                                    onClick={() =>
                                        setDados({
                                            ...dados,
                                            tipo: "despesa"
                                        })
                                    }
                                >
                                    <ArrowDownCircle size={18} />
                                    Despesa
                                </button>

                                <button
                                    className={`btn-toggle ${
                                        dados.tipo === "recebido"
                                            ? "active recebido"
                                            : ""
                                    }`}
                                    onClick={() =>
                                        setDados({
                                            ...dados,
                                            tipo: "recebido"
                                        })
                                    }
                                >
                                    <ArrowUpCircle size={18} />
                                    Receita
                                </button>

                            </div>

                        </div>
                                                {/* Data */}
                        <div className="form-group left-half">
                            <label>Data</label>

                            <div className="input-icon">
                                <Calendar size={18} />

                                <input
                                    className="modal-input"
                                    type="date"
                                    value={dados.data_lancamento}
                                    onChange={(e) =>
                                        setDados({
                                            ...dados,
                                            data_lancamento: e.target.value
                                        })
                                    }
                                />
                            </div>
                        </div>

                        {/* Moeda + Valor + Taxa */}
                        <div
                            className={`form-row ${
                                dados.moeda === "BRL"
                                    ? "cols-2"
                                    : "cols-3"
                            } full-width`}
                        >

                            {/* Moeda */}
                            <div className="form-group">

                                <label>Moeda</label>

                                <div
                                    style={{
                                        position: "relative",
                                        display: "flex",
                                        alignItems: "center"
                                    }}
                                >

                                    <div
                                        style={{
                                            position: "absolute",
                                            left: "10px",
                                            display: "flex",
                                            alignItems: "center",
                                            pointerEvents: "none"
                                        }}
                                    >
                                        {BANDEIRAS[dados.moeda]}
                                    </div>

                                    <select
                                        className="modal-input"
                                        style={{ paddingLeft: "38px" }}
                                        value={dados.moeda}
                                        onChange={(e) =>
                                            setDados({
                                                ...dados,
                                                moeda: e.target.value,
                                                taxa_conversao:
                                                    e.target.value === "BRL"
                                                        ? 1
                                                        : dados.taxa_conversao
                                            })
                                        }
                                    >
                                        <option value="BRL">
                                            BRL (R$)
                                        </option>

                                        <option value="USD">
                                            USD ($)
                                        </option>

                                        <option value="EUR">
                                            EUR (€)
                                        </option>

                                    </select>

                                </div>

                            </div>

                            {/* Valor */}

                            <div className="form-group">

                                <label>Valor Original</label>

                                <div className="input-icon">

                                    <DollarSign size={18} />

                                    <input
                                        className="modal-input"
                                        type="number"
                                        step="0.01"
                                        placeholder="0,00"
                                        value={dados.valor_original || ""}

                                        style={{
                                            color:
                                                dados.tipo === "recebido"
                                                    ? "#39FF14"
                                                    : "#FF007A",
                                            fontWeight: "bold"
                                        }}

                                        onChange={(e) =>
                                            setDados({
                                                ...dados,
                                                valor_original:
                                                    Number(e.target.value)
                                            })
                                        }
                                    />

                                </div>

                            </div>

                            {/* Taxa */}

                            {dados.moeda !== "BRL" && (

                                <div className="form-group">

                                    <label>Taxa de Conversão</label>

                                    <input
                                        className="modal-input"
                                        type="number"
                                        step="0.0001"
                                        value={dados.taxa_conversao}

                                        onChange={(e) =>
                                            setDados({
                                                ...dados,
                                                taxa_conversao:
                                                    Number(e.target.value)
                                            })
                                        }
                                    />

                                </div>

                            )}

                        </div>

                        {/* Total */}

                        <div
                            className={`total-card full-width ${
                                dados.tipo === "recebido"
                                    ? "recebido-layout"
                                    : "despesa-layout"
                            }`}
                        >

                            <h3 className="total-title">

                                {dados.tipo === "recebido" ? (
                                    <>
                                        <TrendingUp size={16} />
                                        <span>TOTAL DA RECEITA</span>
                                    </>
                                ) : (
                                    <>
                                        <TrendingDown size={16} />
                                        <span>TOTAL DA DESPESA</span>
                                    </>
                                )}

                            </h3>

                            <span
                                style={{
                                    color:
                                        dados.tipo === "recebido"
                                            ? "#16c784"
                                            : "#FF2B87"
                                }}
                            >
                                R${" "}
                                {valorBrl.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2
                                })}
                            </span>

                        </div>

                    </div>

                    {/* Descrição */}

                    <div className="form-group full-width">

                        <label>Descrição</label>

                        <div className="input-icon">

                            <FileText size={18} />

                            <input
                                className="modal-input"
                                placeholder="Ex: Tráfego Pago..."
                                value={dados.descricao}

                                onChange={(e) =>
                                    setDados({
                                        ...dados,
                                        descricao: e.target.value
                                    })
                                }
                            />

                        </div>

                    </div>
                                        {/* Rodapé */}

                    <div className="modal-footer full-width">

                        {onDelete && dados.id && (
                            <button
                                type="button"
                                className="btn-delete"
                                style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: "8px" }}
                                onClick={() => onDelete(dados.id, dados.grupo_rateio)}
                            >
                                <Trash2 size={16} />
                                Excluir
                            </button>
                        )}

                        <button
                            className="btn-cancel"
                            onClick={onClose}
                        >
                            Cancelar
                        </button>

                        <button
                            className={`btn-save ${
                                dados.tipo === "recebido"
                                    ? "receita"
                                    : "despesa"
                            }`}
                            onClick={() =>
                                onSave({
                                    ...dados,
                                    username,
                                    valor_brl: valorBrl
                                })
                            }
                        >
                            {lancamento
                                ? "Salvar Alterações"
                                : "Salvar"}
                        </button>

                    </div>

                </div>

            </div>

        </div>

    );

}