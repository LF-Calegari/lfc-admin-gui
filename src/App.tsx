import logoDark from './assets/logo-dark.svg';

function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={logoDark} alt="LFC Admin" style={{ height: 40 }} />
    </div>
  );
}

export default App;
