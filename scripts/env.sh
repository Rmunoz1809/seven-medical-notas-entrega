# Entorno local: node y Java portables, sin tocar el sistema
export PATH="$HOME/.local/node/bin:$HOME/.local/jre21/Contents/Home/bin:$PATH"
export JAVA_HOME="$HOME/.local/jre21/Contents/Home"
export NODE_OPTIONS=--dns-result-order=ipv4first
FIREBASE="npx -y firebase-tools@15.32.1"
