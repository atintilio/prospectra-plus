"""Prepara o anexo revisado sem instalar, iniciar serviços ou baixar modelos."""
from pathlib import Path,PurePosixPath
import hashlib
import sys
import zipfile

EXPECTED='5ccc93d8231c4dd951eba7385dcfa2a02ab6e4cc30a67c0c587aeb9ec4d81fdc'

def prepare(archive:str,destination:str)->Path:
    source,target=Path(archive),Path(destination)
    if hashlib.sha256(source.read_bytes()).hexdigest()!=EXPECTED:
        raise ValueError('Arquivo diferente do VoiceStudio revisado')
    if target.exists():raise ValueError('Destino já existe; preserve os dados e escolha outro')
    with zipfile.ZipFile(source) as bundle:
        if sum(i.file_size for i in bundle.infolist())>120_000_000:raise ValueError('Arquivo excede o tamanho revisado')
        for item in bundle.infolist():
            path=PurePosixPath(item.filename)
            if path.is_absolute() or '..' in path.parts or (item.external_attr>>16)&0o170000==0o120000:
                raise ValueError('Entrada de arquivo insegura')
        target.mkdir(parents=True)
        for item in bundle.infolist():
            parts=PurePosixPath(item.filename).parts[1:]
            if not parts or item.is_dir():continue
            output=target.joinpath(*parts);output.parent.mkdir(parents=True,exist_ok=True)
            output.write_bytes(bundle.read(item))
    return target

if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('Uso: prepare.py VoiceStudio.zip destino')
    print(prepare(sys.argv[1],sys.argv[2]))
