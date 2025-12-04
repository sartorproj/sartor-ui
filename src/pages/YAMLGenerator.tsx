import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check, Sparkles, Scissors, Loader2 } from 'lucide-react';
import { apiClient, type FitProfile, type Strategy } from '../lib/api';

export default function YAMLGenerator() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'fitprofile' | 'tailoring'>('fitprofile');

  // Load strategies and FitProfiles
  const { data: strategies, isLoading: strategiesLoading } = useQuery<Strategy[]>({
    queryKey: ['strategies'],
    queryFn: () => apiClient.listStrategies(),
  });

  const { data: fitProfiles, isLoading: fitProfilesLoading } = useQuery<FitProfile[]>({
    queryKey: ['fitprofiles'],
    queryFn: () => apiClient.listFitProfiles(),
  });

  // FitProfile form state
  const [fitProfileName, setFitProfileName] = useState('');
  const [fitProfileNamespace, setFitProfileNamespace] = useState('default');
  const [fitProfileStrategy, setFitProfileStrategy] = useState('');

  const { data: selectedStrategy } = useQuery<Strategy>({
    queryKey: ['strategy', fitProfileStrategy],
    queryFn: () => apiClient.getStrategy(fitProfileStrategy),
    enabled: !!fitProfileStrategy && fitProfileStrategy !== '',
  });
  const [fitProfileDisplayName, setFitProfileDisplayName] = useState('');
  const [fitProfileDescription, setFitProfileDescription] = useState('');
  const [fitProfileParams, setFitProfileParams] = useState('{}');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [strategyParams, setStrategyParams] = useState<Record<string, any>>({});

  // Tailoring form state
  const [tailoringName, setTailoringName] = useState('');
  const [tailoringNamespace, setTailoringNamespace] = useState('default');
  const [tailoringTargetKind, setTailoringTargetKind] = useState('Deployment');
  const [tailoringTargetName, setTailoringTargetName] = useState('');
  const [tailoringFitProfileName, setTailoringFitProfileName] = useState('');
  const [tailoringFitProfileNamespace, setTailoringFitProfileNamespace] = useState('default');
  const [tailoringRepository, setTailoringRepository] = useState('');
  const [tailoringFilePath, setTailoringFilePath] = useState('');
  const [tailoringAnalysisWindow, setTailoringAnalysisWindow] = useState('168h');
  const [tailoringPaused, setTailoringPaused] = useState(false);

  // Initialize strategy when strategies are loaded - only set default once on initial load
  React.useEffect(() => {
    if (strategies && strategies.length > 0 && !fitProfileStrategy) {
      setFitProfileStrategy(strategies[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategies]);

  // Update parameters when strategy changes
  React.useEffect(() => {
    if (selectedStrategy?.exampleParameters) {
      setFitProfileParams(JSON.stringify(selectedStrategy.exampleParameters, null, 2));
      setStrategyParams(selectedStrategy.exampleParameters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStrategy?.name]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatParamsAsYAML = (paramsObj: Record<string, any>, indent: string = '    '): string => {
    if (Object.keys(paramsObj).length === 0) {
      return `${indent}{}`;
    }

    const lines: string[] = [];
    for (const [key, value] of Object.entries(paramsObj)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        // Nested object - format as YAML
        lines.push(`${indent}${key}:`);
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (nestedValue === null || nestedValue === undefined) continue;
          if (typeof nestedValue === 'string') {
            lines.push(`${indent}  ${nestedKey}: "${nestedValue}"`);
          } else if (typeof nestedValue === 'boolean') {
            lines.push(`${indent}  ${nestedKey}: ${nestedValue}`);
          } else {
            lines.push(`${indent}  ${nestedKey}: ${nestedValue}`);
          }
        }
      } else if (Array.isArray(value)) {
        // Array - format as YAML list
        if (value.length === 0) {
          lines.push(`${indent}${key}: []`);
        } else {
          lines.push(`${indent}${key}:`);
          value.forEach((item) => {
            if (typeof item === 'string') {
              lines.push(`${indent}  - "${item}"`);
            } else if (typeof item === 'object') {
              lines.push(`${indent}  - ${JSON.stringify(item)}`);
            } else {
              lines.push(`${indent}  - ${item}`);
            }
          });
        }
      } else if (typeof value === 'string') {
        lines.push(`${indent}${key}: "${value}"`);
      } else if (typeof value === 'boolean') {
        lines.push(`${indent}${key}: ${value}`);
      } else {
        lines.push(`${indent}${key}: ${value}`);
      }
    }
    return lines.join('\n');
  };

  const generateFitProfileYAML = () => {
    if (!fitProfileName || !fitProfileNamespace || !fitProfileStrategy) {
      return '# Please fill in all required fields (marked with *)';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let paramsObj: Record<string, any> = {};
    try {
      paramsObj = JSON.parse(fitProfileParams || '{}');
    } catch {
      return '# Invalid JSON in parameters field. Please check your JSON syntax.';
    }

    let yaml = `apiVersion: autoscaling.sartorproj.io/v1alpha1
kind: FitProfile
metadata:
  name: ${fitProfileName}
  namespace: ${fitProfileNamespace}
spec:
  strategy: ${fitProfileStrategy}`;

    if (fitProfileDisplayName) {
      yaml += `\n  displayName: "${fitProfileDisplayName}"`;
    }
    if (fitProfileDescription) {
      yaml += `\n  description: "${fitProfileDescription}"`;
    }
    
    yaml += `\n  parameters:\n${formatParamsAsYAML(paramsObj)}\n`;

    return yaml;
  };

  const generateTailoringYAML = () => {
    if (!tailoringName || !tailoringNamespace || !tailoringTargetName || !tailoringFitProfileName || !tailoringRepository || !tailoringFilePath) {
      return '# Please fill in all required fields (marked with *)';
    }

    let yaml = `apiVersion: autoscaling.sartorproj.io/v1alpha1
kind: Tailoring
metadata:
  name: ${tailoringName}
  namespace: ${tailoringNamespace}
spec:
  target:
    kind: ${tailoringTargetKind}
    name: ${tailoringTargetName}
  fitProfileRef:
    name: ${tailoringFitProfileName}`;

    if (tailoringFitProfileNamespace && tailoringFitProfileNamespace !== tailoringNamespace) {
      yaml += `\n    namespace: ${tailoringFitProfileNamespace}`;
    }

    yaml += `\n  writeBack:
    repository: ${tailoringRepository}
    path: ${tailoringFilePath}
    branch: main
    format: raw
  analysisWindow: ${tailoringAnalysisWindow}
  paused: ${tailoringPaused}
`;

    return yaml;
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getGeneratedYAML = () => {
    return activeTab === 'fitprofile' ? generateFitProfileYAML() : generateTailoringYAML();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderStrategyParamInput = (key: string, schema: any, value: any, onChange: (value: any) => void) => {
    const paramType = schema?.type || (typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string');
    const description = schema?.description || '';
    const defaultValue = schema?.default !== undefined ? schema.default : value;

    if (paramType === 'boolean') {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={`param-${key}`}>{key}</Label>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={`param-${key}`}
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor={`param-${key}`} className="cursor-pointer text-sm text-muted-foreground">
              {description || key}
            </Label>
          </div>
        </div>
      );
    }

    if (paramType === 'number' || paramType === 'integer') {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={`param-${key}`}>{key}</Label>
          <Input
            id={`param-${key}`}
            type="number"
            value={value ?? defaultValue ?? ''}
            onChange={(e) => onChange(paramType === 'integer' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
            placeholder={String(defaultValue || '')}
          />
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      );
    }

    // String or enum
    if (schema?.enum) {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={`param-${key}`}>{key}</Label>
          <Select
            value={value ?? defaultValue ?? ''}
            onValueChange={onChange}
          >
            <SelectTrigger id={`param-${key}`}>
              <SelectValue placeholder={`Select ${key}`} />
            </SelectTrigger>
            <SelectContent>
              {schema.enum.map((opt: string) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      );
    }

    return (
      <div key={key} className="space-y-2">
        <Label htmlFor={`param-${key}`}>{key}</Label>
        <Input
          id={`param-${key}`}
          type="text"
          value={value ?? defaultValue ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(defaultValue || '')}
        />
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">YAML Generator</h1>
        <p className="mt-2 text-muted-foreground">
          Generate ready-to-use YAML for FitProfile and Tailoring resources
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'fitprofile' | 'tailoring')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fitprofile">
            <Sparkles className="w-4 h-4 mr-2" />
            FitProfile
          </TabsTrigger>
          <TabsTrigger value="tailoring">
            <Scissors className="w-4 h-4 mr-2" />
            Tailoring
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fitprofile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>FitProfile Configuration</CardTitle>
              <CardDescription>Configure your FitProfile resource</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-name">Name *</Label>
                  <Input
                    id="fp-name"
                    value={fitProfileName}
                    onChange={(e) => setFitProfileName(e.target.value)}
                    placeholder="my-fitprofile"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fp-namespace">Namespace *</Label>
                  <Input
                    id="fp-namespace"
                    value={fitProfileNamespace}
                    onChange={(e) => setFitProfileNamespace(e.target.value)}
                    placeholder="default"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fp-strategy">Strategy *</Label>
                {strategiesLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading strategies...</span>
                  </div>
                ) : (
                  <Select
                    value={fitProfileStrategy}
                    onValueChange={(value) => {
                      setFitProfileStrategy(value);
                      const strategy = strategies?.find(s => s.name === value);
                      if (strategy) {
                        apiClient.getStrategy(value).then(s => {
                          if (s.exampleParameters) {
                            setFitProfileParams(JSON.stringify(s.exampleParameters, null, 2));
                            setStrategyParams(s.exampleParameters);
                          }
                        });
                      }
                    }}
                  >
                    <SelectTrigger id="fp-strategy">
                      <SelectValue placeholder="Select a strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {!strategies || strategies.length === 0 ? (
                        <SelectItem value="" disabled>No strategies available</SelectItem>
                      ) : (
                        strategies.map((s) => (
                          <SelectItem key={s.name} value={s.name}>
                            {s.displayName || s.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                {selectedStrategy && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedStrategy.description}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fp-display-name">Display Name</Label>
                <Input
                  id="fp-display-name"
                  value={fitProfileDisplayName}
                  onChange={(e) => setFitProfileDisplayName(e.target.value)}
                  placeholder={selectedStrategy?.displayName || "Balanced Profile"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fp-description">Description</Label>
                <Textarea
                  id="fp-description"
                  value={fitProfileDescription}
                  onChange={(e) => setFitProfileDescription(e.target.value)}
                  placeholder={selectedStrategy?.description || "A balanced optimization profile"}
                  rows={3}
                />
              </div>

              {/* Strategy-specific parameters */}
              {selectedStrategy && selectedStrategy.parametersSchema && (
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <Label>Strategy Parameters</Label>
                    <p className="text-xs text-muted-foreground mb-4">
                      Configure parameters specific to the {selectedStrategy.displayName} strategy
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {selectedStrategy.parametersSchema?.properties && Object.entries(selectedStrategy.parametersSchema.properties as Record<string, any>).map(([key, schema]: [string, any]) => {
                      const currentValue = strategyParams[key] ?? schema.default;
                      return renderStrategyParamInput(
                        key,
                        schema,
                        currentValue,
                        (newValue) => {
                          const updated = { ...strategyParams, [key]: newValue };
                          setStrategyParams(updated);
                          setFitProfileParams(JSON.stringify(updated, null, 2));
                        }
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tailoring" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tailoring Configuration</CardTitle>
              <CardDescription>Configure your Tailoring resource</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="t-name">Name *</Label>
                  <Input
                    id="t-name"
                    value={tailoringName}
                    onChange={(e) => setTailoringName(e.target.value)}
                    placeholder="my-tailoring"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-namespace">Namespace *</Label>
                  <Input
                    id="t-namespace"
                    value={tailoringNamespace}
                    onChange={(e) => setTailoringNamespace(e.target.value)}
                    placeholder="default"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="t-target-kind">Target Kind *</Label>
                  <Select
                    value={tailoringTargetKind}
                    onValueChange={setTailoringTargetKind}
                  >
                    <SelectTrigger id="t-target-kind">
                      <SelectValue placeholder="Select target kind" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Deployment">Deployment</SelectItem>
                      <SelectItem value="StatefulSet">StatefulSet</SelectItem>
                      <SelectItem value="DaemonSet">DaemonSet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-target-name">Target Name *</Label>
                  <Input
                    id="t-target-name"
                    value={tailoringTargetName}
                    onChange={(e) => setTailoringTargetName(e.target.value)}
                    placeholder="my-app"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="t-fitprofile-name">FitProfile Name *</Label>
                  {fitProfilesLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading FitProfiles...</span>
                    </div>
                  ) : (
                    <Select
                      value={tailoringFitProfileName}
                      onValueChange={(value) => {
                        setTailoringFitProfileName(value);
                        const profile = fitProfiles?.find(p => p.metadata.name === value);
                        if (profile) {
                          setTailoringFitProfileNamespace(profile.metadata.namespace);
                        }
                      }}
                    >
                      <SelectTrigger id="t-fitprofile-name">
                        <SelectValue placeholder="Select a FitProfile" />
                      </SelectTrigger>
                      <SelectContent>
                        {fitProfiles?.map((p) => {
                          const fullName = `${p.metadata.namespace}/${p.metadata.name}`;
                          return (
                            <SelectItem key={fullName} value={p.metadata.name}>
                              {p.spec.displayName || p.metadata.name} ({p.metadata.namespace})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-fitprofile-namespace">FitProfile Namespace</Label>
                  <Input
                    id="t-fitprofile-namespace"
                    value={tailoringFitProfileNamespace}
                    onChange={(e) => setTailoringFitProfileNamespace(e.target.value)}
                    placeholder="default"
                    readOnly
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="t-repository">Repository *</Label>
                  <Input
                    id="t-repository"
                    value={tailoringRepository}
                    onChange={(e) => setTailoringRepository(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-filepath">File Path *</Label>
                  <Input
                    id="t-filepath"
                    value={tailoringFilePath}
                    onChange={(e) => setTailoringFilePath(e.target.value)}
                    placeholder="manifests/app.yaml"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="t-analysis-window">Analysis Window</Label>
                <Input
                  id="t-analysis-window"
                  value={tailoringAnalysisWindow}
                  onChange={(e) => setTailoringAnalysisWindow(e.target.value)}
                  placeholder="168h"
                />
                <p className="text-xs text-muted-foreground">
                  Duration format: 30s, 5m, 1h, 24h, 168h (7 days)
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="t-paused"
                  checked={tailoringPaused}
                  onChange={(e) => setTailoringPaused(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="t-paused" className="cursor-pointer">
                  Paused (dry-run mode)
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Generated YAML */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Generated YAML</CardTitle>
              <CardDescription>
                Copy the generated YAML and apply it to your cluster
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(getGeneratedYAML())}
              disabled={getGeneratedYAML().startsWith('#')}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono max-h-[600px]">
              <code className="text-foreground">{getGeneratedYAML()}</code>
            </pre>
          </div>
          {getGeneratedYAML().startsWith('#') && (
            <p className="text-sm text-muted-foreground mt-2">
              Fill in all required fields to generate YAML
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
