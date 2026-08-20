/**
 * DesktopBlocker — agora pass-through.
 * A versão para computador está ativada; o app funciona em qualquer largura de tela.
 */
const DesktopBlocker = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export default DesktopBlocker;
