import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCcw, Home } from "lucide-react";

export default function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  console.error("Erro capturado pela ErrorPage:", error);

  let title = "Algo deu errado";
  let message = "Ocorreu um erro inesperado na aplicação.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Página não encontrada";
      message = "A página que você está procurando não existe ou foi movida.";
    } else if (error.status === 401) {
      title = "Não autorizado";
      message = "Você não tem permissão para acessar esta página.";
    } else if (error.status === 503) {
      title = "Serviço indisponível";
      message = "O servidor está temporariamente sobrecarregado ou em manutenção.";
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <div className="mb-6 rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      
      <p className="mb-8 max-w-md text-muted-foreground">
        {message}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button 
          variant="default" 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2"
        >
          <RefreshCcw className="h-4 w-4" />
          Tentar novamente
        </Button>
        
        <Button 
          variant="outline" 
          onClick={() => navigate("/")}
          className="flex items-center gap-2"
        >
          <Home className="h-4 w-4" />
          Voltar ao início
        </Button>
      </div>

      <div className="mt-12 text-xs text-muted-foreground/50">
        ID do Erro: {Math.random().toString(36).substring(2, 9).toUpperCase()}
      </div>
    </div>
  );
}
